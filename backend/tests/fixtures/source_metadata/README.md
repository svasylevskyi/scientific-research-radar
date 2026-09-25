# Metadata contract fixtures

These are small constructed API-shaped fixtures, not downloaded full responses
and not a human-reviewed scientific evaluation benchmark. Bibliographic ground
truth was checked against these primary pages on 2026-09-25:

- https://www.nature.com/articles/nature14539 — title, DOI, three authors, online
  publication date 2015-05-27. The additional print date is a synthetic alternate
  date for the matching rule; no live Crossref response was used.
- https://arxiv.org/abs/1706.03762 — title, eight authors, initial submission
  2017-06-12, latest version v7 and revision date 2023-08-02.

Tests mutate the records to cover punctuation, author initials, conflicting
identities/titles/authors/dates, incomplete date precision, missing metadata,
duplicates, unsupported URLs, unavailable providers, and arXiv version handling.
Abstract text is omitted. No source passages or full text are copied or verified.
