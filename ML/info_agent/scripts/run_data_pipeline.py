"""Run the real-data-only Able Band batch pipeline."""

import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
STEPS = (
    "collect_ablenews_rss.py", "collect_theindigo_news.py", "collect_welfarenews.py",
    "collect_socialfocus.py", "collect_policy_briefing.py", "collect_public_welfare.py",
    "collect_local_welfare.py", "collect_bokjiro.py", "collect_koddi_report_api.py", "collect_kpf_news_metadata.py",
    "collect_targeted_accessibility_news.py", "merge_real_documents.py", "validate_documents.py",
)


def main() -> int:
    results = []
    for script in STEPS:
        print(f"\n{'=' * 12} {script} {'=' * 12}", flush=True)
        result = subprocess.run([sys.executable, str(SCRIPT_DIR / script)], check=False)
        results.append((script, result.returncode == 0))
    print("\n배치 파이프라인 결과")
    for script, success in results:
        print(f"  {script}: {'성공' if success else '실패'}")
    # Collector failures do not block later stages; validation determines final success.
    return 0 if results[-1][1] else 1


if __name__ == "__main__":
    sys.exit(main())
