"""Export the contracted routes without starting workers or contacting services."""

import json
from importlib import import_module

from app.api.router import api_router
from app.api.routes.stripe_sandbox import webhook_router
from fastapi import FastAPI
from fastapi.routing import APIRoute

CONTRACT_MODULES = frozenset(
    {
        "contact",
        "admin_pricing",
        "admin_spending",
        "admin_subscriptions",
        "billing_sync",
        "stripe_sandbox",
        "subscriber_billing",
        "subscription_access",
        "subscription_observation",
    }
)


def contract_routes():
    routes = []
    for name in sorted(CONTRACT_MODULES):
        module = import_module(f"app.api.routes.{name}")
        for attribute in ("router", "admin_router", "webhook_router"):
            router = getattr(module, attribute, None)
            if router:
                routes.extend(
                    route for route in router.routes if isinstance(route, APIRoute)
                )
    return routes


def schema():
    # Mirror production prefixes without loading main's lifespan or workers.
    app = FastAPI(title="Radar API contracts", version="1")
    app.include_router(api_router, prefix="/api/v1")
    app.include_router(webhook_router, prefix="/api/v1/webhooks")
    return app.openapi()


if __name__ == "__main__":
    print(json.dumps(schema(), sort_keys=True))
