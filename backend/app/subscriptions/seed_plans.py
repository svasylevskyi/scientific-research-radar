"""Preview or create initial draft plans, without changing existing plan codes."""
import argparse
import json
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models.subscription_plan import SubscriptionPlanRevision
from app.schemas.subscription_plan import SubscriptionPlanConfiguration


def initial_plans():
    proposals = [
        ("preview", "Preview", "0.00", None, 1, 10, 10, 1, 1, [], 14,
         "One-time research preview proposal. Trial eligibility and expiry must be implemented before launch."),
        ("explorer", "Explorer", "9.00", "90.00", 2, 20, 50, 5, 1, ["weekly", "monthly", "quarterly"], 0,
         "Stay informed about the subjects you love. Scheduled and manual research share a monthly allowance."),
        ("researcher", "Researcher", "19.00", "190.00", 5, 30, 200, 20, 5, ["daily", "weekly", "monthly", "quarterly"], 0,
         "Follow important research across your fields. Scheduling remains subject to the total monthly allowance."),
        ("professional", "Professional", "39.00", "390.00", 10, 30, 500, 50, 15, ["daily", "weekly", "monthly", "quarterly"], 0,
         "Scientific intelligence across multiple topics. Scheduling remains subject to the total monthly allowance."),
    ]
    result = {}
    for order, (code, name, monthly, annual, digests, per_run, papers, runs, manual, frequencies, trial, description) in enumerate(proposals):
        result[code] = SubscriptionPlanConfiguration(name=name, description=description,
            state="draft", currency="EUR", monthly_price=monthly, annual_price=annual,
            tax_display="undecided", max_digests=digests, max_papers_per_run=per_run,
            papers_per_month=papers, runs_per_month=runs, manual_runs_per_month=manual,
            schedule_frequencies=frequencies, email_delivery=True, trial_days=trial,
            display_order=order).model_dump(mode="json")
    return result


def seed_plans(db, *, apply=False):
    results = []
    for code, configuration in initial_plans().items():
        existing = db.scalar(select(SubscriptionPlanRevision.id).where(SubscriptionPlanRevision.code == code).limit(1))
        if existing is not None:
            results.append({"code": code, "action": "skipped", "reason": "Plan code already exists; all revisions preserved"})
            continue
        if apply:
            try:
                with db.begin_nested():
                    db.add(SubscriptionPlanRevision(code=code, revision=1, configuration=configuration,
                        change_note="Initial draft created by seed_plans v1; provisional prices and allowances for admin review.", created_by=None))
                    db.flush()
            except IntegrityError:
                # A concurrent seed/admin may have created this code after our read.
                if db.scalar(select(SubscriptionPlanRevision.id).where(SubscriptionPlanRevision.code == code).limit(1)) is None:
                    raise
                results.append({"code": code, "action": "skipped", "reason": "Plan code created concurrently"})
                continue
        results.append({"code": code, "action": "created" if apply else "would_create", "configuration": configuration})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create missing drafts; default is read-only preview")
    args = parser.parse_args()
    from app.db.session import SessionLocal
    with SessionLocal() as db:
        with db.begin():
            result = seed_plans(db, apply=args.apply)
    print(json.dumps({"mode": "apply" if args.apply else "preview", "plans": result}, indent=2))


if __name__ == "__main__":
    main()
