"""Opt-in real MySQL 8.4 seed checks; uses only a disposable container, never the local .env/DB.

RUN_SEED_MYSQL_TESTS=1 python -m unittest discover -s infrastructure/scripts -p test_application_seed_mysql.py
"""
from concurrent.futures import ThreadPoolExecutor
import os
import re
from pathlib import Path
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "infrastructure/seed/application-preparations.sql"


@unittest.skipUnless(os.environ.get("RUN_SEED_MYSQL_TESTS") == "1", "requires explicit disposable Docker MySQL test")
class ApplicationSeedMySqlTest(unittest.TestCase):
    @classmethod
    def docker(cls, *args, sql=None):
        return subprocess.run([os.environ.get("SEED_TEST_DOCKER", "docker"), *args],
                              input=sql, text=True, encoding="utf-8", capture_output=True, timeout=90)

    @classmethod
    def query(cls, sql, check=True):
        result = cls.docker("exec", "-i", cls.container, "mysql", "-uroot", "-pseed-test-only",
                            "--default-character-set=utf8mb4", "-N", "-B", "seed_test", sql=sql)
        if check and result.returncode:
            raise AssertionError(result.stderr)
        return result

    @classmethod
    def setUpClass(cls):
        cls.container = "govbiz-application-seed-test-" + uuid.uuid4().hex[:10]
        result = cls.docker("run", "-d", "--name", cls.container, "--tmpfs", "/var/lib/mysql",
                            "-e", "MYSQL_ROOT_PASSWORD=seed-test-only", "-e", "MYSQL_DATABASE=seed_test", "mysql:8.4")
        if result.returncode:
            raise AssertionError(result.stderr)
        cls.addClassCleanup(cls.docker, "rm", "-f", "-v", cls.container)
        for _ in range(60):
            if cls.query("SELECT 1", check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise AssertionError("MySQL did not become ready")
        migrations = ROOT / "backend/core-api/src/main/resources/db/migration"
        # Unmodified production schemas for exactly the tables exercised here.
        for version in (5, 15, 16, 30, 31, 35):
            path, = migrations.glob(f"V{version}__*.sql")
            cls.query(path.read_text(encoding="utf-8"))

    def setUp(self):
        self.query("DELETE FROM account; INSERT INTO account(email,password_hash,terms_agreed_at) "
                   "VALUES ('member@govbiz.local','test',NOW()),('other@govbiz.local','test',NOW());")

    def seed(self):
        return self.query(SEED.read_text(encoding="utf-8"))

    def snapshot(self):
        return self.query("SELECT * FROM account ORDER BY id; SELECT * FROM application_preparation ORDER BY id; "
                          "SELECT * FROM application_preparation_fact ORDER BY id; "
                          "SELECT * FROM application_preparation_content ORDER BY id;").stdout

    def test_adds_two_preparations_and_repeated_run_preserves_every_row(self):
        self.seed()
        counts = self.query("SELECT (SELECT COUNT(*) FROM application_preparation), "
                            "(SELECT COUNT(*) FROM application_preparation_fact), "
                            "(SELECT COUNT(*) FROM application_preparation_content);").stdout.strip()
        self.assertEqual(counts, "2\t11\t2")
        self.assertIn("넥스트웨이브", self.snapshot())
        before = self.snapshot()
        self.seed()
        self.assertEqual(self.snapshot(), before)

    def test_existing_user_edits_and_other_account_are_untouched(self):
        self.seed()
        self.query("UPDATE application_preparation SET demo_seed_key=NULL; "
                   "UPDATE application_preparation SET input_revision=99, progress_stage='APPLIED'; "
                   "UPDATE application_preparation_content SET content_text='직접 작성한 내용 & 특수문자 <>'; "
                   "DELETE FROM application_preparation_fact;")
        before = self.snapshot()
        self.seed()
        after = self.snapshot()
        self.assertIn("직접 작성한 내용 & 특수문자 <>", after)
        self.assertIn("APPLIED", after)
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation_fact").stdout.strip(), "11")
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation").stdout.strip(), "4")
        for line in before.splitlines():
            self.assertIn(line, after.splitlines())

    def test_deleted_demo_is_recreated_without_touching_remaining_demo(self):
        self.seed()
        self.query("DELETE FROM application_preparation WHERE demo_seed_key='innovation-voucher-marketing-v1'")
        before = self.snapshot()
        self.seed()
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation").stdout.strip(), "2")
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation_content").stdout.strip(), "2")
        for line in before.splitlines():
            self.assertIn(line, self.snapshot().splitlines())

    def test_initial_seed_preserves_member_work_unless_reset_is_explicit(self):
        self.seed()
        self.query("UPDATE application_preparation SET demo_seed_key=NULL")
        before = self.snapshot()
        full_seed = SEED.with_name("demo-data.sql").read_text(encoding="utf-8")
        delete = re.search(r"DELETE application_preparation[^;]+;", full_seed).group()
        self.query(delete)
        self.assertEqual(self.snapshot(), before)
        self.query("SET @reset_application_preparations=1; " + delete)
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation").stdout.strip(), "0")

    def test_same_form_in_other_account_does_not_prevent_member_seed(self):
        self.seed()
        self.query("UPDATE application_preparation SET owner_account_id=(SELECT id FROM account WHERE email='other@govbiz.local')")
        before = self.snapshot()
        self.seed()
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation").stdout.strip(), "4")
        for line in before.splitlines():
            self.assertIn(line, self.snapshot().splitlines())

    def test_mid_seed_error_rolls_back_and_retry_succeeds(self):
        sql = SEED.read_text(encoding="utf-8").replace("INSERT INTO application_preparation_content (",
                "INSERT INTO nonexistent_seed_table VALUES (1);\nINSERT INTO application_preparation_content (")
        before = self.snapshot()
        self.assertNotEqual(self.query(sql, check=False).returncode, 0)
        self.assertEqual(self.snapshot(), before)
        self.seed()
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation").stdout.strip(), "2")

    def test_missing_member_fails_without_writing(self):
        self.query("DELETE FROM account WHERE email='member@govbiz.local'")
        self.assertNotEqual(self.query(SEED.read_text(encoding="utf-8"), check=False).returncode, 0)
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation").stdout.strip(), "0")

    def test_concurrent_seed_does_not_duplicate(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.seed(), range(2)))
        self.assertTrue(all(result.returncode == 0 for result in results))
        self.assertEqual(self.query("SELECT COUNT(*) FROM application_preparation").stdout.strip(), "2")


if __name__ == "__main__":
    unittest.main()
