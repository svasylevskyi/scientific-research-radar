import gzip
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SHA = 'a' * 40
REPO = 'svasylevskyi/scientific-research-radar'

# A fake Docker transport lets us check publication without touching a registry.
DOCKER = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['DOCKER_LOG'], 'a') as stream:
    stream.write(json.dumps(args) + '\\n')
if args == ['load']:
    assert sys.stdin.buffer.read() == b'tested image archive'
elif args[:2] == ['image', 'inspect']:
    if 'Labels' in args[3]:
        print(os.environ.get('TEST_IMAGE_REVISION', os.environ['GITHUB_SHA']))
    else:
        component = 'backend' if '-backend:' in args[-1] else 'web'
        digest = ('b' if component == 'backend' else 'c') * 64
        print(json.dumps(['ghcr.io/' + os.environ['GITHUB_REPOSITORY'] + '-' + component + '@sha256:' + digest]))
elif args[0] not in ('tag', 'push'):
    raise SystemExit('Unexpected Docker operation')
'''


class PublishTests(unittest.TestCase):
    def publish(self, revision=SHA):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name)
        docker = path / 'docker'
        docker.write_text(DOCKER)
        docker.chmod(0o755)
        archive = path / 'images.tar.gz'
        with gzip.open(archive, 'wb') as stream:
            stream.write(b'tested image archive')
        manifest, log = path / 'release.json', path / 'docker.log'
        env = os.environ | dict(PATH=f'{path}:' + os.environ['PATH'], DOCKER_LOG=str(log),
                                GITHUB_REPOSITORY=REPO, GITHUB_SHA=SHA, GITHUB_RUN_ID='123',
                                GITHUB_RUN_ATTEMPT='2', GITHUB_STEP_SUMMARY=str(path / 'summary'),
                                TEST_IMAGE_REVISION=revision)
        result = subprocess.run(['bash', 'infra/scripts/publish-images.sh', str(archive), str(manifest)],
                                cwd=ROOT, env=env, capture_output=True, text=True)
        return result, manifest, [json.loads(line) for line in log.read_text().splitlines()]

    def test_publishes_loaded_images_without_building_and_records_both_digests(self):
        result, manifest, calls = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(manifest.read_text())
        self.assertEqual(value['sha'], SHA)
        self.assertEqual(value['run_id'], 123)
        self.assertEqual(value['run_attempt'], 2)
        self.assertEqual(value['backend_digest'], 'sha256:' + 'b' * 64)
        self.assertEqual(value['web_digest'], 'sha256:' + 'c' * 64)
        self.assertEqual(calls[0], ['load'])
        for component in ('backend', 'web'):
            self.assertIn(['push', f'ghcr.io/{REPO}-{component}:{SHA}-123-2'], calls)
        self.assertFalse(any(call[0] in ('build', 'buildx') for call in calls))

    def test_wrong_image_revision_fails_before_publication(self):
        result, manifest, calls = self.publish('d' * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(manifest.exists())
        self.assertFalse(any(call[0] == 'push' for call in calls))
