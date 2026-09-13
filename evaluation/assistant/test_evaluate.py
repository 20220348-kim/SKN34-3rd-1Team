"""모델 호출 없이 도움말 파서·질문 세트·채점 규칙을 검증한다."""

import unittest

from evaluate import build_requests, load_help_entries, load_questions, score, summarize


class HelpEntryParserTest(unittest.TestCase):
    def test_reads_every_chatbot_help_entry_in_the_ai_service_contract_shape(self):
        entries = load_help_entries()
        ids = [entry["id"] for entry in entries]
        self.assertIn("search-score-meaning", ids)
        self.assertIn("partner-write-requires-company", ids)
        for entry in entries:
            self.assertEqual(
                set(entry), {"id", "title", "question", "summary", "body", "limitation", "audience", "status", "action"},
            )
            self.assertIn(entry["audience"], ("public", "member", "company", "admin"))
            self.assertIn(entry["status"], ("available", "demo", "planned"))
            if entry["action"] is not None:
                self.assertRegex(entry["action"]["to"], r"^/app/[A-Za-z0-9/-]*$", "action route must be a bare /app path")
        # 필터 검색 항목의 `?mode=filter` 질의는 프런트처럼 떼어 낸다.
        status_entry = next(entry for entry in entries if entry["id"] == "status-unknown-source")
        self.assertEqual(status_entry["action"], {"label": "필터 검색 열기", "to": "/app/chat"})


class QuestionSetTest(unittest.TestCase):
    def test_questions_validate_against_the_ai_service_request_contract(self):
        fixture = load_questions()
        prepared = build_requests(fixture, load_help_entries())
        self.assertEqual(len(prepared), len(fixture["cases"]))
        help_cases = [case for case, _ in prepared if case["expectedIntent"] == "PRODUCT_HELP"]
        self.assertEqual(len(help_cases), 30, "도움말 10항목 × 표현 3개")
        unanswerable = [case for case, _ in prepared if case["expectedIntent"] in ("OUT_OF_SCOPE", "UNCLEAR")]
        self.assertEqual(len(unanswerable), 10, "답할 수 없는 문항 10개")
        for case, request in prepared:
            self.assertEqual(request.message, case["message"])
            self.assertEqual(len(request.help_entries), len(load_help_entries()))
            if case["expectedIntent"] == "PROGRAM_QUESTION":
                self.assertTrue(request.context.program_selected, f"{case['id']}: 공고 질문은 상세 화면에서 묻는다")
            if case["expectedIntent"] == "ACCOUNT_STATE":
                self.assertTrue(request.session.authenticated, f"{case['id']}: 상태 질문은 로그인 세션으로 묻는다")


class ScoringTest(unittest.TestCase):
    def test_scores_intent_citation_topic_and_abstain(self):
        help_case = {"id": "H", "split": "dev", "expectedIntent": "PRODUCT_HELP", "expectedCitation": "search-score-meaning"}
        account_case = {"id": "A", "split": "heldout", "expectedIntent": "ACCOUNT_STATE", "expectedAccountTopic": "SAVED_PROGRAMS"}
        oos_case = {"id": "N", "split": "dev", "expectedIntent": "OUT_OF_SCOPE"}
        results = [
            score(help_case, {"intent": "PRODUCT_HELP", "citations": ["eligibility-unknown"]}),
            score(account_case, {"intent": "ACCOUNT_STATE", "accountTopic": "SAVED_PROGRAMS"}),
            score(oos_case, {"intent": "UNCLEAR"}),
            score(oos_case, None),
        ]
        self.assertTrue(results[0]["intentCorrect"])
        self.assertFalse(results[0]["citationCorrect"])
        self.assertTrue(results[1]["accountTopicCorrect"])
        self.assertFalse(results[2]["intentCorrect"])
        self.assertTrue(results[2]["abstained"], "UNCLEAR도 기권으로 센다")
        self.assertEqual(results[3]["error"], "no output")

        summary = summarize(results)
        self.assertEqual(summary["scored"], 3)
        self.assertEqual(summary["errors"], 1)
        self.assertAlmostEqual(summary["intentAccuracy"], 2 / 3, places=3)
        self.assertEqual(summary["helpCitationAccuracy"], 0.0)
        self.assertEqual(summary["accountTopicAccuracy"], 1.0)
        self.assertEqual(summary["abstainRateOnUnanswerable"], 1.0)
        self.assertEqual(summary["falseAbstainRateOnAnswerable"], 0.0)
        self.assertEqual(summary["perSplit"]["heldout"]["intentAccuracy"], 1.0)


if __name__ == "__main__":
    unittest.main()
