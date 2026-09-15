"""Keep orchestration explicit and persistence/provider policy out of pure rules."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"


def imports(path):
    result = set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            result.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            result.add(node.module or "")
    return result


def test_pure_stage_inputs_and_validation_have_no_runtime_dependencies():
    for name in ("stage_inputs", "validation"):
        dependencies = imports(APP / "radar" / f"{name}.py")
        assert not any(
            item.startswith(("app.services", "app.repositories", "sqlalchemy", "httpx"))
            for item in dependencies
        )


def test_research_repositories_do_not_coordinate_services_or_provider_calls():
    for name in ("digest_run", "run_state", "run_result", "radar_request"):
        dependencies = imports(APP / "repositories" / f"{name}_repository.py")
        assert not any(
            item.startswith(
                (
                    "app.services",
                    "app.radar.runner",
                    "app.radar.submission",
                    "app.radar.lifecycle",
                    "app.radar.request_execution",
                )
            )
            for item in dependencies
        )


def test_runner_does_not_own_transactions_or_accounting():
    path = APP / "radar" / "runner.py"
    assert not any(
        item.startswith(("app.repositories", "app.services")) for item in imports(path)
    )
    attributes = {
        node.attr
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.Attribute)
    }
    assert not attributes & {
        "commit",
        "rollback",
        "add",
        "scalar",
        "renew_lease",
        "settle",
        "on_usage",
    }
