"""Write a compact CI timing summary from pytest's JUnit report."""
import argparse
from pathlib import Path
import xml.etree.ElementTree as ET


def summarize(path: Path) -> str:
    root = ET.parse(path).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    cases = list(root.iter("testcase"))
    totals = {phase: 0.0 for phase in ("setup", "call", "teardown")}
    for case in cases:
        for prop in case.findall("properties/property"):
            for phase in totals:
                if prop.get("name") == f"{phase}_seconds":
                    totals[phase] += float(prop.get("value", "0"))
    elapsed = sum(float(suite.get("time", "0")) for suite in suites)
    failed = sum(case.find("failure") is not None or case.find("error") is not None for case in cases)
    return (
        "### PostgreSQL tests\n\n"
        f"{len(cases)} tests reported; {failed} failures/errors. Elapsed: **{elapsed:.1f}s**.\n\n"
        "| Phase | Summed test time |\n| --- | ---: |\n"
        + "".join(f"| {phase.capitalize()} | {seconds:.1f}s |\n" for phase, seconds in totals.items())
        + "\nPhase totals include fixtures and overlap across parallel workers. "
        "The job log lists the slowest test phases; the JUnit artifact retains all results.\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("summary", type=Path)
    args = parser.parse_args()
    if args.report.exists():
        with args.summary.open("a", encoding="utf-8") as output:
            output.write(summarize(args.report))
    else:
        print("No JUnit report was produced; inspect the earlier failed step.")
