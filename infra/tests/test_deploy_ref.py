import subprocess
from pathlib import Path

HELPER = Path(__file__).resolve().parents[1] / 'scripts/deploy-ref.sh'


def test_branch_allowlist_is_development_only(tmp_path):
    repo = tmp_path / 'repo'
    clone = tmp_path / 'clone'
    def git(*args, cwd=repo):
        return subprocess.check_output(['git', *args], cwd=cwd, text=True, stderr=subprocess.DEVNULL).strip()
    repo.mkdir()
    git('init', '-b', 'main')
    git('config', 'user.name', 'Test')
    git('config', 'user.email', 'test@example.com')
    def commit(name):
        (repo / 'file').write_text(name)
        git('add', '.')
        git('commit', '-m', name)
        return git('rev-parse', 'HEAD')
    main = commit('main')
    git('switch', '-c', 'feature/paid-subscriptions')
    feature = commit('subscription')
    git('switch', '-c', 'unapproved', 'main')
    other = commit('other')
    git('clone', str(repo), str(clone), cwd=tmp_path)
    for sha, environment, allowed in [(main, 'production', True), (main, 'development', True),
                                      (feature, 'development', True), (feature, 'production', False),
                                      (feature, 'staging', False), (other, 'development', False),
                                      ('invalid', 'development', False)]:
        result = subprocess.run(['bash', '-c', 'source "$1"; verify_deploy_ref "$2" "$3" "$4"',
                                 '_', str(HELPER), str(clone), sha, environment], capture_output=True)
        assert (result.returncode == 0) == allowed, result.stderr
