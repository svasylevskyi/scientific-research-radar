from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.services.billing_renewal_policy import is_renewal_upgrade


def plan(code, **overrides):
    return SimpleNamespace(code=code, configuration={
        'billing_type': 'stripe', 'currency': 'EUR', 'monthly_price': '9.00', 'annual_price': '90.00',
        'max_digests': 2, 'max_papers_per_run': 20, 'papers_per_month': 50,
        'runs_per_month': 5, 'manual_runs_per_month': 1,
        'schedule_frequencies': ['weekly', 'monthly'], 'email_delivery': True, **overrides})


@pytest.mark.parametrize('price', ['50.00', '90.00', '200.00'])
def test_tier_improvement_is_independent_of_yearly_discount(price):
    source = plan('explorer'); target = plan('researcher', annual_price=price, max_digests=5)
    before = deepcopy((source.configuration, target.configuration))
    assert is_renewal_upgrade(source=source, target=target)
    assert before == (source.configuration, target.configuration)


@pytest.mark.parametrize('overrides', [
    {'max_digests': 1}, {'max_papers_per_run': 10}, {'papers_per_month': 49},
    {'runs_per_month': 4}, {'manual_runs_per_month': 0}, {'schedule_frequencies': ['monthly']},
    {'email_delivery': False}, {'currency': 'USD'}, {'billing_type': 'free'},
])
def test_upgrade_cannot_remove_a_capability_or_cross_billing_currency(overrides):
    assert not is_renewal_upgrade(source=plan('explorer'), target=plan('researcher', **overrides))


def test_price_increase_and_same_tier_revision_are_not_higher_tier_upgrades():
    assert not is_renewal_upgrade(source=plan('explorer'), target=plan('researcher', monthly_price='99.00'))
    assert not is_renewal_upgrade(source=plan('explorer'), target=plan('explorer', max_digests=10))
    assert not is_renewal_upgrade(source=plan('free', billing_type='free'), target=plan('researcher', max_digests=10))
