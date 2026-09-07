"""Escaped HTML and text variants of the stored briefing; never calls an LLM."""
from html import escape
from urllib.parse import urlsplit

from app.services.email_service import OutgoingEmail


def safe_url(value):
    try:
        parsed = urlsplit(value or "")
        return value if parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username and not parsed.password else None
    except ValueError:
        return None


def briefing_email(run, recipient, base_url):
    briefing = run.briefing
    data = briefing.data
    link = f"{base_url.rstrip('/')}/digests/{run.digest_id}?run_id={run.id}"
    sections = []
    plain = [briefing.title, briefing.executive_summary]

    def paragraph(value):
        return f'<p style="white-space:pre-wrap;line-height:1.6">{escape(str(value))}</p>'

    def section(title, values):
        values = list(values) or ["None identified in this run."]
        plain.extend([title, *[str(value) for value in values]])
        sections.append(f'<tr><td style="padding:20px 28px;border-top:1px solid #dce5ea"><h2 style="font-size:19px;color:#087d67">{escape(title)}</h2>{"".join(paragraph(v) for v in values)}</td></tr>')

    section("Highlights", data.get("highlights", []))
    signal = data.get("main_signal")
    section("Main signal", [signal["title"], signal["summary"], f"Why it matters: {signal['why_it_matters']}",
        f"Confidence: {signal['confidence']}", f"Supporting papers: {', '.join(signal.get('supporting_external_ids', []))}",
        *signal.get("caveats", [])] if signal else [])
    papers = {row.paper.external_id: row.paper for row in run.paper_results}
    paper_html = []
    paper_text = []
    for category, key in [("Top paper", "top_paper_external_ids"), ("Secondary paper", "secondary_paper_external_ids")]:
        for paper_id in data.get(key, []):
            paper = papers.get(paper_id)
            title = paper.title if paper else paper_id
            url = safe_url(paper.url) if paper else None
            paper_text.append(f"{category}: {title}" + (f" — {url}" if url else ""))
            title_html = escape(title)
            if url:
                title_html = f'<a style="color:#087d67" href="{escape(url, quote=True)}">{title_html}</a>'
            paper_html.append(f'<p>{category}: {title_html}</p>')
    plain.extend(["Papers to read", *(paper_text or ["No papers selected."])])
    sections.append('<tr><td style="padding:20px 28px;border-top:1px solid #dce5ea"><h2 style="font-size:19px;color:#087d67">Papers to read</h2>' + ("".join(paper_html) or "<p>No papers selected.</p>") + '</td></tr>')
    section("Recommended actions", [f"{r['action']} ({r['priority']})\n{r['reason']}" for r in data.get("recommendations", [])])
    section("Recommended searches", [f"{r['query']} ({r['priority']})\n{r['reason']}" for r in data.get("recommended_next_searches", [])])
    section("Transparency and limitations", [f"Source basis: {data.get('source_basis', 'unknown')}", data.get("transparency_note", ""), *data.get("quality_warnings", [])])
    plain.extend(["View this digest on Radar:", link, "Manage email delivery in this digest's schedule settings. AI-assisted research: consult original sources."])
    html = f'''<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px 8px;background:#f5f8fa;color:#102333;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:white">
<tr><td style="padding:28px;background:#071a2b;color:white"><p style="color:#42e6bd">SCIENTIFIC RESEARCH RADAR</p><h1 style="font-size:26px">{escape(briefing.title)}</h1></td></tr>
<tr><td style="padding:20px 28px"><h2 style="font-size:19px">Executive summary</h2>{paragraph(briefing.executive_summary)}</td></tr>
{"".join(sections)}
<tr><td style="padding:28px"><a href="{escape(link, quote=True)}" style="display:inline-block;padding:14px 20px;background:#087d67;color:white;text-decoration:none;border-radius:8px">View digest on Radar</a>
<p style="font-size:12px;color:#5b6b78">Manage email delivery in this digest's schedule settings. AI-assisted research: consult original sources.</p></td></tr>
</table></td></tr></table></body></html>'''
    # Stable across retries. SMTP cannot guarantee exactly-once delivery after an ambiguous disconnect.
    message_id = f"<radar-{run.id}@{urlsplit(base_url).hostname}>"
    subject = " ".join(briefing.title.split())[:180]
    return OutgoingEmail(recipient=recipient, subject=f"Your research briefing: {subject}", text="\n\n".join(plain), html=html, message_id=message_id)
