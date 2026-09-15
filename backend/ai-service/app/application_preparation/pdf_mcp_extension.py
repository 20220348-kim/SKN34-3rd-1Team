"""Pinned pdf-edit-mcp with the optional embedded cmap lookup corrected.

Some valid PDF font subsets omit a TrueType cmap and provide /ToUnicode in
the PDF instead. Engine 0.2.0 raises KeyError during OPTIONAL cmap recovery,
discarding its already decoded /ToUnicode. No replacement mapping is invented.
"""
import hashlib
from pathlib import Path


def verify_whole_text_object_deletion(source_path: str, output_path: str, expected_text: str) -> dict:
    import pikepdf
    import pdf_edit_engine as engine
    from pdf_edit_engine.locator import ContentStreamInterpreter
    from pdf_edit_engine._pathutil import read_stream_bounded

    source, output = Path(source_path), Path(output_path)
    if source.is_symlink() or output.is_symlink() or source.resolve().parent != output.resolve().parent or source.resolve() == output.resolve():
        return {"verified": False, "reason": "PATH"}
    if any(not 0 < p.stat().st_size <= 32 * 1024 * 1024 for p in (source, output)):
        return {"verified": False, "reason": "SIZE"}

    def empty_show(instruction):
        if str(instruction.operator) == "Tj":
            return len(instruction.operands) == 1 and bytes(instruction.operands[0]) == b""
        if str(instruction.operator) == "TJ":
            return not any(bytes(item) for item in instruction.operands[0] if isinstance(item, pikepdf.String))
        return False

    matches = engine.find(str(source), expected_text)
    if len(matches) != 1:
        return {"verified": False, "reason": "SOURCE_SELECTION"}
    def character_id(page, char):
        return (page, char.operator_index, char.byte_position, char.tj_fragment_index, char.unicode_char)
    selected = {character_id(matches[0].page_number, char) for char in matches[0].characters}
    deleted = set()
    changed_blocks, retained_blocks = set(), set()
    with pikepdf.open(source) as before, pikepdf.open(output) as after:
        if len(before.pages) != len(after.pages):
            return {"verified": False, "reason": "PAGE_COUNT"}

        def inherited(page, key):
            node = page.obj
            for _ in range(64):
                value = node.get(key)
                if value is not None:
                    return value.unparse()
                node = node.get("/Parent")
                if node is None:
                    return None
            raise ValueError("Page tree limit")

        def resource_streams(pdf):
            contents = set()
            for page in pdf.pages:
                value = page.obj.get("/Contents")
                if isinstance(value, pikepdf.Stream):
                    contents.add(value.objgen)
                elif isinstance(value, pikepdf.Array):
                    contents.update(item.objgen for item in value)
            return sorted(hashlib.sha256(read_stream_bounded(obj, max_decoded=32 * 1024 * 1024, label="verification-resource")).hexdigest() for obj in pdf.objects
                          if isinstance(obj, pikepdf.Stream) and obj.objgen not in contents and str(obj.get("/Type")) not in {"/Metadata", "/ObjStm", "/XRef"})

        if resource_streams(before) != resource_streams(after):
            return {"verified": False, "reason": "RESOURCE_STREAMS"}
        for page_index, (a_page, b_page) in enumerate(zip(before.pages, after.pages)):
            if any(inherited(a_page, key) != inherited(b_page, key) for key in ("/MediaBox", "/CropBox", "/Rotate", "/UserUnit")):
                return {"verified": False, "reason": "PAGE_GEOMETRY"}
            a_ops, b_ops = list(pikepdf.parse_content_stream(a_page)), list(pikepdf.parse_content_stream(b_page))
            if len(a_ops) != len(b_ops):
                return {"verified": False, "reason": "OPERATOR_COUNT"}
            block = None
            changed_operators = set()
            for index, (a, b) in enumerate(zip(a_ops, b_ops)):
                op = str(a.operator)
                if op == "BT":
                    block = (page_index, index)
                changed = pikepdf.unparse_content_stream([a]) != pikepdf.unparse_content_stream([b])
                if changed:
                    if op not in {"TJ", "Tj"} or str(b.operator) not in {"TJ", "Tj"} or block is None or not empty_show(b):
                        return {"verified": False, "reason": "TEXT_OBJECT_CHANGE"}
                    changed_blocks.add(block)
                    changed_operators.add(index)
                if str(b.operator) in {"TJ", "Tj", "'", '"'} and not empty_show(b):
                    retained_blocks.add(block)
                if op == "ET":
                    block = None
            if changed_operators:
                for element in ContentStreamInterpreter(a_page, page_index).interpret():
                    for char in element.characters or []:
                        if char.operator_index in changed_operators:
                            deleted.add(character_id(page_index, char))
        # No retained glyph shares a text object with a deletion, and all
        # positioning/graphics operators are byte-equivalent after parsing.
        verified = bool(changed_blocks) and not (changed_blocks & retained_blocks) and deleted == selected
    return {"verified": verified, "changedTextObjects": len(changed_blocks),
            "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest()}


def main():
    import pikepdf
    import pdf_edit_engine.fonts as fonts
    import pdf_edit_engine.locator as locator
    from pdf_edit_mcp.app import mcp
    from pdf_edit_mcp.server import main as serve

    original = fonts.reverse_embedded_cmap

    def reverse(font):
        # The upstream contract defines an empty map when no usable cmap exists.
        # The caller keeps the authoritative PDF /ToUnicode mapping unchanged.
        if "cmap" not in font:
            return {}
        return original(font)

    fonts.reverse_embedded_cmap = reverse
    original_info = locator._build_font_info

    def font_info(font, name):
        base_name = font.get("/BaseFont")
        if base_name is not None:
            try:
                str(base_name)
            except UnicodeDecodeError:
                # Legacy Korean PDF Name bytes need not be UTF-8. Use their
                # lossless PDF lexical escape in DISPLAY metadata only.
                # The source font dictionaries and embedded fonts stay untouched.
                metadata = pikepdf.Dictionary(font)
                metadata["/BaseFont"] = pikepdf.Name(base_name.unparse().decode("ascii"))
                return original_info(metadata, name)
        return original_info(font, name)

    locator._build_font_info = font_info
    mcp.tool(name="govbiz_verify_pdf_deletion")(verify_whole_text_object_deletion)
    serve()


if __name__ == "__main__":
    main()
