"""fetcher._get: retries transient errors, fails fast on 403, raises when retries run out."""

import unittest
from unittest import mock

import httpx

from reddit_opt_scraper import fetcher


def _client(responses: list) -> tuple[httpx.Client, list]:
    calls: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        r = responses[min(len(calls), len(responses)) - 1]
        if isinstance(r, Exception):
            raise r
        return r

    return httpx.Client(transport=httpx.MockTransport(handler)), calls


@mock.patch.object(fetcher.time, "sleep", lambda _s: None)
class GetTests(unittest.TestCase):
    def test_403_raises_auth_error_without_retry(self):
        client, calls = _client([httpx.Response(403)])
        with self.assertRaises(fetcher.AuthError):
            fetcher._get(client, "https://www.reddit.com/x.json", None, {})
        self.assertEqual(len(calls), 1)

    def test_retries_5xx_and_network_errors(self):
        client, calls = _client([
            httpx.Response(502),
            httpx.ConnectError("reset"),
            httpx.Response(200, json={"ok": True}),
        ])
        self.assertEqual(fetcher._get(client, "https://www.reddit.com/x.json", None, {}), {"ok": True})
        self.assertEqual(len(calls), 3)

    def test_gives_up_after_max_retries(self):
        client, calls = _client([httpx.Response(503)])
        with self.assertRaises(RuntimeError):
            fetcher._get(client, "https://www.reddit.com/x.json", None, {})
        self.assertEqual(len(calls), fetcher._MAX_RETRIES)

    def test_other_4xx_raises_immediately(self):
        client, calls = _client([httpx.Response(404)])
        with self.assertRaises(httpx.HTTPStatusError):
            fetcher._get(client, "https://www.reddit.com/x.json", None, {})
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
