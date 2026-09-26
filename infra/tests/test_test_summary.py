import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'backend/scripts/summarize_tests.py'
spec = importlib.util.spec_from_file_location('test_summary', SCRIPT)
summary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(summary)


class SummaryTests(unittest.TestCase):
    def test_junit_reports_elapsed_separately_from_overlapping_phase_times(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'results.xml'
            path.write_text('''<testsuites><testsuite time="5.2">
              <testcase><properties><property name="setup_seconds" value="2"/>
                <property name="call_seconds" value="3"/>
                <property name="teardown_seconds" value="1"/></properties></testcase>
              <testcase><properties><property name="setup_seconds" value="1"/>
                <property name="call_seconds" value="2"/>
                <property name="teardown_seconds" value="0.5"/></properties><failure/></testcase>
            </testsuite></testsuites>''')
            result = summary.summarize(path)
            self.assertIn('2 tests reported; 1 failures/errors', result)
            self.assertIn('Elapsed: **5.2s**', result)
            self.assertIn('| Setup | 3.0s |', result)
            self.assertIn('| Call | 5.0s |', result)
            self.assertIn('| Teardown | 1.5s |', result)
