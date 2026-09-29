import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
FIXTURES = ROOT / "fixtures"


class FixtureContractTests(unittest.TestCase):
    def load(self, name):
        return json.loads((FIXTURES / name).read_text(encoding="utf-8"))

    def test_pass_fixture_contract(self):
        data = self.load("content-play-pass.json")
        self.assertEqual(data["request"]["method"], "GET")
        self.assertEqual(data["response"]["status"], 200)
        self.assertEqual(data["response"]["body"]["resultCode"], "OK")
        self.assertTrue(data["response"]["body"]["resultObj"]["tme"]["feeds"])

    def test_manifest_fixture_contract(self):
        data = self.load("manifest-m3u8.json")
        self.assertEqual(data["response"]["status"], 200)
        self.assertTrue(data["response"]["body"].startswith("#EXTM3U"))

    def test_synthetic_failure_fixture_contracts(self):
        vpn = self.load("content-play-vpn-block.json")
        auth = self.load("content-play-auth-expired.json")
        self.assertEqual(vpn["sourceType"], "synthetic")
        self.assertEqual(vpn["response"]["status"], 403)
        self.assertEqual(auth["sourceType"], "synthetic")
        self.assertEqual(auth["response"]["status"], 401)

    def test_fixtures_do_not_contain_session_material(self):
        text = "\n".join(p.read_text(encoding="utf-8") for p in FIXTURES.glob("*.json"))
        self.assertIsNone(re.search(r"eyJ[A-Za-z0-9_-]{30,}", text))
        self.assertIsNone(re.search(r"/v2/pa_[A-Za-z0-9_-]{30,}", text))
        self.assertIn("<REDACTED>", text)
