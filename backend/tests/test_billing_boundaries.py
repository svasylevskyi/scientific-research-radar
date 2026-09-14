"""Guard billing dependency direction, including function-local imports."""

import ast
from pathlib import Path

SERVICES = Path(__file__).resolve().parents[1] / "app" / "services"


def service_dependencies():
    modules = {f"app.services.{p.stem}": p for p in SERVICES.glob("*.py")}
    graph = {module: set() for module in modules}
    for module, path in modules.items():
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Import):
                graph[module].update(a.name for a in node.names if a.name in modules)
            elif isinstance(node, ast.ImportFrom):
                if node.module in modules:
                    graph[module].add(node.module)
                for alias in node.names:
                    target = f"{node.module}.{alias.name}"
                    if target in modules:
                        graph[module].add(target)
    return graph


def test_service_dependencies_have_no_cycles():
    graph = service_dependencies()
    visited = set()

    def visit(module, ancestors):
        assert module not in ancestors, "Dependency cycle: " + " -> ".join(
            (*ancestors, module)
        )
        if module in visited:
            return
        for dependency in sorted(graph[module]):
            visit(dependency, (*ancestors, module))
        visited.add(module)

    for module in sorted(graph):
        visit(module, ())


def test_billing_foundations_only_depend_on_lower_layers():
    allowed = {
        "billing_provider": {"stripe_catalogue_service"},
        "billing_payment_rules": {"billing_provider"},
        "billing_policy": {"billing_provider", "billing_payment_rules"},
        "billing_invoice_service": {
            "billing_provider",
            "billing_payment_rules",
            "stripe_catalogue_service",
        },
        "billing_change_observation": {
            "billing_provider",
            "billing_policy",
            "billing_invoice_service",
            "billing_notification_service",
        },
        "billing_upgrade_observation": {
            "billing_provider",
            "billing_payment_rules",
            "billing_invoice_service",
            "billing_notification_service",
        },
    }
    graph = service_dependencies()
    for module, dependencies in allowed.items():
        actual = {
            name.removeprefix("app.services.")
            for name in graph[f"app.services.{module}"]
        }
        assert actual <= dependencies, (
            f"{module} imports an upper layer: {actual - dependencies}"
        )


def test_observers_and_payment_rules_leave_transactions_to_callers():
    for name in (
        "billing_change_observation",
        "billing_upgrade_observation",
        "billing_payment_rules",
    ):
        for node in ast.walk(ast.parse((SERVICES / f"{name}.py").read_text())):
            if not isinstance(node, ast.Call) or not isinstance(
                node.func, ast.Attribute
            ):
                continue
            assert node.func.attr not in {"commit", "rollback"}, (
                f"{name} must not complete transactions"
            )
            if node.func.attr == "request":
                assert (
                    node.args
                    and isinstance(node.args[0], ast.Constant)
                    and node.args[0].value == "GET"
                ), f"{name} must not submit Stripe commands"
