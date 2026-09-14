"""Exercise the demo-data seed script guards with a fake Docker command and check the SQL only touches demo rows."""

from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("seed-demo-data.sh")
SEED_FILE = Path(__file__).parents[1] / "seed" / "demo-data.sql"
BASH = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe" if os.name == "nt" else Path("/bin/bash")
FAKE_DOCKER = r"""#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SEED_DOCKER_CALLS"
case "$*" in
  *" ps --services --status running") printf '%s\n' ${SEED_RUNNING_SERVICES-mysql qdrant ai-service core-api web};;
  *" exec --no-TTY mysql "*) cat > "$SEED_STDIN_COPY";;
esac
exit 0
"""


class SeedDemoDataTest(unittest.TestCase):
    def run_script(self, **overrides):
        with tempfile.TemporaryDirectory(prefix="seed-demo-data-test-") as directory:
            root = Path(directory)
            docker = root / "docker"
            docker.write_text(FAKE_DOCKER, encoding="utf-8")
            docker.chmod(0o700)
            env_file = root / "env"
            env_file.write_text("MYSQL_DATABASE=govbiz\n", encoding="utf-8")
            calls = root / "calls"
            stdin_copy = root / "stdin"
            environment = {
                "PATH": f"{root}:/usr/bin:/bin",
                "TMPDIR": root.as_posix(),
                "SEED_DOCKER_CALLS": str(calls),
                "SEED_STDIN_COPY": str(stdin_copy),
                "GOVBIZ_ENV_FILE": str(env_file),
                **overrides,
            }
            result = subprocess.run(
                [str(BASH), str(SCRIPT)],
                cwd=SCRIPT.parents[2],
                env=environment,
                capture_output=True,
                text=True,
                timeout=10,
            )
            calls_text = calls.read_text(encoding="utf-8") if calls.exists() else ""
            stdin_text = stdin_copy.read_text(encoding="utf-8") if stdin_copy.exists() else ""
            return result, calls_text, stdin_text

    def test_pipes_the_seed_file_into_the_mysql_container(self):
        result, calls, stdin = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("exec --no-TTY mysql sh -c", calls)
        self.assertEqual(stdin, SEED_FILE.read_text(encoding="utf-8"))
        # 자격 증명은 컨테이너 환경 변수로만 읽고 호스트 명령줄에 싣지 않습니다.
        self.assertNotIn("--password=", calls.replace('--password="$MYSQL_PASSWORD"', ""))

    def test_refuses_when_mysql_or_core_api_is_not_running(self):
        result, calls, stdin = self.run_script(SEED_RUNNING_SERVICES="mysql qdrant web")
        self.assertEqual(result.returncode, 1)
        self.assertIn("core-api", result.stderr)
        self.assertNotIn("exec", calls)
        self.assertEqual(stdin, "")

    def test_refuses_without_env_file(self):
        result, calls, _ = self.run_script(GOVBIZ_ENV_FILE="/nonexistent/env")
        self.assertEqual(result.returncode, 1)
        self.assertIn("Missing", result.stderr)
        self.assertEqual(calls, "")

    def test_seed_sql_only_deletes_demo_rows(self):
        sql = SEED_FILE.read_text(encoding="utf-8")
        deletes = re.findall(r"^DELETE[^;]*;", sql, flags=re.MULTILINE | re.DOTALL)
        self.assertEqual(len(deletes), 4, deletes)
        self.assertIn("email LIKE '%@demo.govbiz.local'", deletes[0])
        self.assertIn("'admin@govbiz.local', 'member@govbiz.local'", deletes[1])
        self.assertIn("email = 'admin@govbiz.local'", deletes[2])
        self.assertIn("saved_support_program", deletes[3])
        self.assertIn("'admin@govbiz.local', 'member@govbiz.local'", deletes[3])
        # 모집글은 실제 공고 행에 붙으므로 공고 테이블은 읽기만 합니다.
        self.assertNotRegex(sql, r"(?i)(INSERT INTO|DELETE FROM|UPDATE)\s+support_program\b")
        demo_emails = set(re.findall(r"'([a-z.]+@demo\.govbiz\.local)'", sql))
        self.assertEqual(len(demo_emails), 20)
        # 직접 가입한 실제 이메일은 데모 자료에 넣지 않습니다. 허용 도메인은 govbiz.local뿐입니다.
        for email in re.findall(r"[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", sql):
            self.assertTrue(email.endswith("govbiz.local"), email)

    def test_compose_entrypoint_waits_for_programs_and_respects_the_switch(self):
        entrypoint = SCRIPT.with_name("seed-demo-data-entrypoint.sh").read_text(encoding="utf-8")
        self.assertNotIn("\r", entrypoint, "entrypoint must stay LF-terminated for the container")
        self.assertIn('if [ "${DEMO_SEED_ENABLED:-false}" != "true" ]', entrypoint)
        self.assertIn("application_end_date >= DATE_ADD(CURDATE(), INTERVAL 21 DAY)", entrypoint)
        # 최초 1회만 넣습니다. 대표 데모 계정이 있으면 건너뛰고 DEMO_SEED_FORCE=true일 때만 다시 넣습니다.
        self.assertIn('if [ "${DEMO_SEED_FORCE:-false}" != "true" ]', entrypoint)
        self.assertIn("jihoon.park@demo.govbiz.local", entrypoint)
        self.assertIn("jihoon.park@demo.govbiz.local", SEED_FILE.read_text(encoding="utf-8"))
        compose = (SCRIPT.parents[1] / "compose.yaml").read_text(encoding="utf-8")
        self.assertIn("demo-seed:", compose)
        self.assertIn("DEMO_SEED_ENABLED: ${DEMO_SEED_ENABLED:-true}", compose)
        self.assertIn("DEMO_SEED_FORCE: ${DEMO_SEED_FORCE:-false}", compose)


if __name__ == "__main__":
    unittest.main()
