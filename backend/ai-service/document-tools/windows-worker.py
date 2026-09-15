"""Fixed entry point for the isolated Topabaem05 MCP environment."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.application_preparation.windows_hwp_mcp import mcp
mcp.run(transport="stdio")
