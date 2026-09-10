from sqlalchemy import select, func
from app.models.subscription_plan import SubscriptionPlanRevision
from app.subscriptions.seed_plans import initial_plans, seed_plans
from app.schemas.subscription_plan import SubscriptionPlanConfiguration


def test_preview_apply_and_repeat_preserve_existing_plans(db_session_factory):
    with db_session_factory() as db:
        db.add(SubscriptionPlanRevision(code='explorer', revision=1, configuration={'name': 'Custom'}, change_note='Own draft'))
        db.add(SubscriptionPlanRevision(code='explorer', revision=2, configuration={'name': 'Archived custom', 'state': 'archived'}, change_note='Retired'))
        db.commit()
        preview = seed_plans(db)
        db.commit()
        assert sum(row['action'] == 'would_create' for row in preview) == 3
        assert db.scalar(select(func.count()).select_from(SubscriptionPlanRevision)) == 2
        result = seed_plans(db, apply=True)
        db.commit()
        assert sum(row['action'] == 'created' for row in result) == 3
        rows = list(db.scalars(select(SubscriptionPlanRevision)))
        assert len(rows) == 5
        assert [row.configuration['name'] for row in rows if row.code == 'explorer'] == ['Custom', 'Archived custom']
        for row in rows:
            if row.code == 'explorer': continue
            assert row.configuration['state'] == 'draft'
            assert row.revision == 1 and row.created_by is None
            assert 'seed_plans' in row.change_note
        assert all(row['action'] == 'skipped' for row in seed_plans(db, apply=True))
        db.commit()
        assert db.scalar(select(func.count()).select_from(SubscriptionPlanRevision)) == 5


def test_seed_proposals_fit_the_catalogue_contract():
    plans = initial_plans()
    assert list(plans) == ['preview', 'explorer', 'researcher', 'professional']
    for config in plans.values():
        validated = SubscriptionPlanConfiguration.model_validate(config)
        assert validated.state == 'draft' and validated.currency == 'EUR'
        assert validated.max_papers_per_run <= 30
        assert validated.manual_runs_per_month <= validated.runs_per_month
        assert validated.tax_display == 'undecided'
    assert plans['preview']['runs_per_month'] == 1
    assert plans['preview']['schedule_frequencies'] == []
    assert plans['professional']['monthly_price'] == '39.00'
