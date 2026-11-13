"""Generate golden values for the TS port: signatures, query strings, parsers.

All expected values come from the reference implementation itself
(minimax2api/app/signing.py + upstream.py), so the TS port in
packages/core/src/connectors/minimax-wire.ts can be diffed byte for byte.

Usage:
    MINIMAX2API_DIR=/path/to/minimax2api python scripts/gen-minimax-golden.py

Output is JSON; the values already baked into minimax-wire.test.ts came from
a run of this script.  Re-run it (and update the test) after touching signing.
"""
import json
import os
import sys

_REF = os.environ.get("MINIMAX2API_DIR", r"D:\projects\minimax2api\minimax2api")
if _REF not in sys.path:
    sys.path.insert(0, _REF)

from app import signing  # noqa: E402
from app import upstream  # noqa: E402
from app.config import Settings  # noqa: E402
from app.upstream import Credential  # noqa: E402

UNIX_MS = 1759999999123
UNIX_S = UNIX_MS // 1000

settings = Settings()
client = upstream.MiniMaxClient(lambda: settings)

cred_cn = Credential(
    region="cn",
    token="TOKEN-XYZ",
    user_id="123456",
    device_id="deviceid-abc",
    uuid="uuid-001",
    screen_width=1920,
    screen_height=1080,
)
cred_desktop = Credential(
    region="cn",
    token="ACCESS",
    bearer="BEARER-1",
    user_id="123456",
    device_id="deviceid-abc",
    uuid="uuid-001",
)

out = {
    "x_signature": {
        "unix_seconds": UNIX_S,
        "body": '{"content":"hi"}',
        "expected": signing.x_signature(UNIX_S, '{"content":"hi"}'),
    },
    "yy": {
        "sign_url": "/minimax-cloud/api/v1/signin/status?device_platform=web&uuid=uuid-001",
        "body": "{}",
        "unix_ms": UNIX_MS,
        "expected": signing.yy(
            "/minimax-cloud/api/v1/signin/status?device_platform=web&uuid=uuid-001",
            "{}",
            UNIX_MS,
        ),
    },
    "form_encode": {
        "input": "a b!~*'()\u00fc\u4e2d",
        "expected": signing.form_encode("a b!~*'()\u00fc\u4e2d"),
    },
    "query_signature_cn": client._signin_query(settings, cred_cn, UNIX_MS, for_signature=True),
    "query_wire_cn": client._signin_query(settings, cred_cn, UNIX_MS, for_signature=False),
    "query_signature_desktop": client._signin_query(
        settings, cred_desktop, UNIX_MS, for_signature=True
    ),
    "query_wire_desktop": client._signin_query(
        settings, cred_desktop, UNIX_MS, for_signature=False
    ),
    "base_url_cn": client.base_url(settings, cred_cn),
    "base_url_global": client.base_url(
        settings, Credential(region="global", token="T", uuid="u", device_id="d")
    ),
}

panel_payload = {
    "data": {
        "scene": 4,
        "days": [
            {"day_no": 1, "points": 400, "status": 3, "is_today": True},
            {"day_no": 2, "points": 400, "status": 1},
            {"day_no": 3, "points": 1000, "status": 1},
        ],
    }
}
panel = upstream._parse_panel(upstream._core_of(panel_payload))
out["panel"] = {
    "scene": panel.scene,
    "days": [
        {"dayNo": d.day_no, "points": d.points, "status": d.status, "isToday": d.is_today}
        for d in panel.days
    ],
    "claimedToday": panel.claimed_today,
}

credit_payload = {
    "data": {
        "plan_name": "Max",
        "plan_type": 2,
        "op_credit_summary": {
            "total_remaining_amount": "800.269",
            "free_remaining_amount": "800.269",
            "purchased_remaining_amount": "0.0",
        },
    }
}
core = upstream._core_of(credit_payload)
out["credit"] = {
    "planName": str(core.get("plan_name")),
    "planType": int(core.get("plan_type")),
    "total": float(core["op_credit_summary"]["total_remaining_amount"]),
    "free": float(core["op_credit_summary"]["free_remaining_amount"]),
}

print(json.dumps(out, ensure_ascii=False, indent=1))
