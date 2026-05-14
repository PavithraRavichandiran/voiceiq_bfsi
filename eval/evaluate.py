#!/usr/bin/env python3
"""
VoiceIQ-BFSI Evaluation Script
Measures entity extraction accuracy and pipeline latency across 25 Hinglish BFSI test cases.

Usage:
  python eval/evaluate.py                          # runs against localhost:3000
  python eval/evaluate.py --url http://host:port   # custom server URL
"""

import json
import sys
import time
import argparse
import statistics
import urllib.request
import urllib.error
from pathlib import Path

ENTITY_KEYS = [
    'loan_amount', 'loan_tenure', 'emi_amount', 'product_type',
    'pan_number', 'monthly_income', 'interest_rate', 'call_intent',
]


def call_api(base_url, transcript, timeout=30):
    payload = json.dumps({'transcript': transcript}).encode('utf-8')
    req = urllib.request.Request(
        f'{base_url}/api/extract',
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            return body, (time.time() - t0) * 1000, None
    except urllib.error.HTTPError as e:
        return None, 0, f'HTTP {e.code}: {e.read().decode()}'
    except Exception as e:
        return None, 0, str(e)


def values_match(extracted, ground_truth):
    """Returns True when extracted entity matches ground truth."""
    if ground_truth is None and extracted is None:
        return True
    if ground_truth is None and extracted is not None:
        return False   # hallucination
    if ground_truth is not None and extracted is None:
        return False   # missed

    gt_val = ground_truth.get('value')
    ex_val = extracted.get('value') if isinstance(extracted, dict) else None

    if gt_val is None or ex_val is None:
        return False

    if isinstance(gt_val, (int, float)) and isinstance(ex_val, (int, float)):
        if gt_val == 0:
            return ex_val == 0
        return abs(gt_val - ex_val) / abs(gt_val) <= 0.01   # 1% tolerance

    return str(gt_val).strip().upper() == str(ex_val).strip().upper()


def evaluate_sample(extracted_entities, ground_truth):
    results = {}
    for key in ENTITY_KEYS:
        gt = ground_truth.get(key)
        ex = (extracted_entities or {}).get(key)
        results[key] = {
            'match':   values_match(ex, gt),
            'gt_null': gt is None,
            'ex_null': ex is None,
        }
    return results


def compute_metrics(all_results, key):
    tp = sum(1 for r in all_results if not r[key]['gt_null'] and     r[key]['match'])
    fp = sum(1 for r in all_results if     r[key]['gt_null'] and not r[key]['ex_null'])
    fn = sum(1 for r in all_results if not r[key]['gt_null'] and not r[key]['match'])

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {'precision': precision, 'recall': recall, 'f1': f1, 'tp': tp, 'fp': fp, 'fn': fn}


def pct(values, p):
    if not values:
        return 0
    s = sorted(values)
    return s[min(int(len(s) * p / 100), len(s) - 1)]


def run_evaluation(test_cases, label, use_noisy, api_url):
    print(f"\n{'=' * 62}")
    print(f"  {label}")
    print(f"{'=' * 62}")

    all_results, latencies, errors = [], [], 0

    for i, case in enumerate(test_cases):
        transcript = case['noisy_transcript'] if use_noisy else case['clean_transcript']
        tag = f"[{i+1:02d}/{len(test_cases)}] {case['scenario'][:44]:<44}"
        print(f"  {tag}", end=' ', flush=True)

        response, wall_ms, err = call_api(api_url, transcript)

        if err or not response:
            print(f"ERROR — {err}")
            errors += 1
            continue

        extracted = response.get('entities', {})
        sample_results = evaluate_sample(extracted, case['ground_truth'])
        all_results.append(sample_results)

        api_ms = response.get('latency', {}).get('total_ms', wall_ms)
        latencies.append(api_ms)

        hit = sum(1 for r in sample_results.values() if r['match'])
        print(f"{hit}/8  {api_ms:5.0f}ms")

    if not all_results:
        print('\n  No results — is the server running on', api_url)
        return None

    if errors:
        print(f'\n  Errors: {errors}/{len(test_cases)}')

    # Per-entity breakdown
    print(f"\n  {'Entity':<18} {'Precision':>9} {'Recall':>7} {'F1':>6}  TP  FP  FN")
    print(f"  {'-' * 56}")

    total_f1 = 0.0
    for key in ENTITY_KEYS:
        m = compute_metrics(all_results, key)
        total_f1 += m['f1']
        print(f"  {key:<18} {m['precision']:>8.1%} {m['recall']:>6.1%} "
              f"{m['f1']:>5.1%}  {m['tp']:>2}  {m['fp']:>2}  {m['fn']:>2}")

    macro_f1 = total_f1 / len(ENTITY_KEYS)
    overall_acc = sum(
        1 for r in all_results for v in r.values() if v['match']
    ) / (len(all_results) * len(ENTITY_KEYS))

    print(f"\n  Overall field accuracy : {overall_acc:.1%}")
    print(f"  Macro F1               : {macro_f1:.1%}")

    if latencies:
        print(f"\n  Latency  ({len(latencies)} calls measured)")
        print(f"    Mean : {statistics.mean(latencies):.0f}ms")
        print(f"    P50  : {pct(latencies, 50):.0f}ms")
        print(f"    P90  : {pct(latencies, 90):.0f}ms")
        print(f"    P99  : {pct(latencies, 99):.0f}ms")

    return {'overall_acc': overall_acc, 'macro_f1': macro_f1}


def main():
    parser = argparse.ArgumentParser(description='VoiceIQ-BFSI Evaluation')
    parser.add_argument('--url', default='http://localhost:3000', help='API base URL')
    args = parser.parse_args()

    test_set_path = Path(__file__).parent / 'test_set.json'
    if not test_set_path.exists():
        print(f'test_set.json not found at {test_set_path}', file=sys.stderr)
        sys.exit(1)

    with open(test_set_path) as f:
        test_cases = json.load(f)

    print(f'\nVoiceIQ-BFSI Evaluation  |  {len(test_cases)} test cases  |  {args.url}')

    noisy = run_evaluation(test_cases, 'Noisy transcripts  (STT errors present → corrector runs)', True,  args.url)
    clean = run_evaluation(test_cases, 'Clean transcripts  (baseline — no STT errors)',            False, args.url)

    if noisy and clean:
        delta = noisy['overall_acc'] - clean['overall_acc']
        sign  = '+' if delta >= 0 else ''
        print(f"\n{'=' * 62}")
        print(f"  STT Correction Impact")
        print(f"{'=' * 62}")
        print(f"  Accuracy on clean transcripts       : {clean['overall_acc']:.1%}")
        print(f"  Accuracy on noisy + corrected       : {noisy['overall_acc']:.1%}")
        print(f"  Delta                               : {sign}{delta:.1%}")
        print()


if __name__ == '__main__':
    main()
