import csv
import importlib.util
from pathlib import Path
from statistics import mean, median, pstdev

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis"
BASE_SCRIPT = ROOT / "scripts" / "generate_validation_analysis.py"

spec = importlib.util.spec_from_file_location("base_validation", BASE_SCRIPT)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
Analyzer = base.Analyzer
FIXED_SCENARIOS = base.FIXED_SCENARIOS
ROUTE_TYPES = base.ROUTE_TYPES
RANDOM_CATEGORIES = base.RANDOM_CATEGORIES
haversine = base.haversine
feature_point = base.feature_point
turns = base.turns


def write_csv(path, rows, fields=None):
    if not rows:
        return
    fields = fields or list(rows[0].keys())
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def pct(part, whole):
    return round(part / whole * 100, 2) if whole else 0


def pct_change(new, old):
    return round((new - old) / old * 100, 2) if old else 0


def summarize(values):
    return {
        "count": len(values),
        "mean_m": round(mean(values), 2),
        "median_m": round(median(values), 2),
        "std_m": round(pstdev(values), 2),
        "min_m": round(min(values), 2),
        "max_m": round(max(values), 2),
        "within_20m_count": sum(1 for v in values if v <= 20),
        "within_20m_ratio_pct": pct(sum(1 for v in values if v <= 20), len(values)),
        "over_50m_count": sum(1 for v in values if v > 50),
        "over_100m_count": sum(1 for v in values if v > 100),
    }


def selected_candidate_stores(analyzer):
    selected = {}
    starts = list(analyzer.starts.values())
    for categories in FIXED_SCENARIOS.values():
        for start in starts:
            for route_type in ROUTE_TYPES:
                for store in analyzer.final_route(categories, start, route_type):
                    selected[store["properties"].get("id")] = store
            for store in analyzer.existing_route(categories, start, "상생형"):
                selected[store["properties"].get("id")] = store
    for category in RANDOM_CATEGORIES + ["의류·잡화"]:
        for store in analyzer.candidate_pool(category, include_outer=True, limit=20):
            selected[store["properties"].get("id")] = store
    return list(selected.values())


def store_connection_quality(analyzer):
    rows = []
    for store in selected_candidate_stores(analyzer):
        props = store["properties"]
        point = feature_point(store)
        node = analyzer.store_node(store)
        distance = haversine(point, node)
        rows.append({
            "store_id": props.get("id"),
            "store_name": props.get("name"),
            "shopping_category": props.get("shopping_category"),
            "distance_zone": props.get("distance_zone"),
            "direct_market_match": props.get("directMarketMatch"),
            "nearest_node": node["node_id"],
            "nearest_node_name": node.get("name", node["node_id"]),
            "distance_to_node_m": round(distance, 2),
            "coordinate_duplicate_count": props.get("coordinate_duplicate_count", 1),
        })
    rows.sort(key=lambda row: (-float(row["distance_to_node_m"]), row["shopping_category"], row["store_name"] or ""))
    stats = summarize([float(row["distance_to_node_m"]) for row in rows])
    md = f"""# 점포-보행 네트워크 연결거리 검증

## 분석 대상

전체 점포 1,200개 전체가 아니라, 경로 추천에서 실제 후보로 사용될 가능성이 높은 점포 집합을 대상으로 점포 좌표와 가장 가까운 보행 네트워크 노드 사이의 연결거리를 계산했다. 이 값은 점포가 보행 네트워크에 얼마나 잘 붙어 있는지를 나타낸다.

## 요약 통계

| 지표 | 값 |
|---|---:|
| 분석 후보 점포 수 | {stats['count']}개 |
| 평균 연결거리 | {stats['mean_m']}m |
| 중앙값 연결거리 | {stats['median_m']}m |
| 표준편차 | {stats['std_m']}m |
| 최소 연결거리 | {stats['min_m']}m |
| 최대 연결거리 | {stats['max_m']}m |
| 20m 이내 점포 수 | {stats['within_20m_count']}개 |
| 20m 이내 비율 | {stats['within_20m_ratio_pct']}% |
| 50m 초과 점포 수 | {stats['over_50m_count']}개 |
| 100m 초과 점포 수 | {stats['over_100m_count']}개 |

## 해석

연결거리가 짧을수록 점포 좌표가 보행 네트워크와 잘 맞아 경로 계산 신뢰도가 높다. 반대로 50m를 초과하는 점포는 실제 점포 위치가 대표 주소 좌표로 뭉쳐 있거나, 현재 보행 네트워크가 해당 골목을 충분히 세분화하지 못했을 가능성이 있다. 100m를 초과하는 점포는 향후 현장조사 또는 추가 노드 보강의 우선 검토 대상이다.
"""
    return rows, md


def fixed_store_route_type_comparison(analyzer):
    rows = []
    center = analyzer.starts["시장 중심점"]
    for scenario_id, categories in FIXED_SCENARIOS.items():
        fixed_stores = analyzer.final_route(categories, center, "빠른 장보기")
        fixed_names = " > ".join(f"{store['properties'].get('shopping_category')}:{store['properties'].get('name')}" for store in fixed_stores)
        for route_type in ROUTE_TYPES:
            path = analyzer.network_path(fixed_stores, center, route_type)
            edge_distance = path["edge_dist"]
            main_length = sum(edge["length_m"] for edge in path["edges"] if edge["is_main_aisle"])
            inner_length = sum(edge["length_m"] for edge in path["edges"] if edge["is_inner_alley"])
            cognitive = sum(edge["cognitive_cost"] for edge in path["edges"])
            rows.append({
                "scenario_id": scenario_id,
                "scenario_categories": ", ".join(categories),
                "fixed_store_sequence": fixed_names,
                "route_type": route_type,
                "total_distance_m": round(path["total"], 1),
                "expected_time_min": round(path["total"] / base.WALKING_M_PER_MIN, 2),
                "turn_count": turns(path["points"]),
                "cognitive_cost_sum": round(cognitive, 1),
                "main_aisle_ratio_pct": round(main_length / edge_distance * 100, 2) if edge_distance else 0,
                "inner_alley_ratio_pct": round(inner_length / edge_distance * 100, 2) if edge_distance else 0,
                "transit_node_count": len(set(path["nodes"])),
            })
    return rows


def force_outer_route(analyzer, categories, start, route_type="상생형"):
    current_route = analyzer.final_route(categories, start, route_type)
    if any(store["properties"].get("distance_zone") == "외곽부" for store in current_route):
        return current_route, False, None
    best = None
    for index, current_store in enumerate(current_route):
        category = current_store["properties"].get("shopping_category")
        outer_candidates = [store for store in analyzer.candidate_pool(category, include_outer=True, limit=55) if store["properties"].get("distance_zone") == "외곽부"]
        for candidate in outer_candidates[:20]:
            trial = list(current_route)
            trial[index] = candidate
            trial = analyzer.two_opt(analyzer.nn_order(trial, start, route_type), start, route_type)
            metrics = analyzer.metrics(trial, start, "M5", route_type, True)
            if best is None or metrics["total_distance_m"] < best[0]["total_distance_m"]:
                best = (metrics, trial, category, candidate)
    if best is None:
        return current_route, False, None
    return best[1], True, {"replaced_category": best[2], "outer_store_name": best[3]["properties"].get("name")}


def winwin_policy_diagnostic(analyzer):
    center = analyzer.starts["시장 중심점"]
    rows = []
    for scenario_id, categories in FIXED_SCENARIOS.items():
        fast = analyzer.metrics(analyzer.final_route(categories, center, "빠른 장보기"), center, "M5", "빠른 장보기", True)
        current_route = analyzer.final_route(categories, center, "상생형")
        current = analyzer.metrics(current_route, center, "M5", "상생형", True)
        forced_route, forced, info = force_outer_route(analyzer, categories, center, "상생형")
        forced_metrics = analyzer.metrics(forced_route, center, "M5", "상생형", True)
        rows.append({
            "scenario_id": scenario_id,
            "categories": ", ".join(categories),
            "current_winwin_distance_m": current["total_distance_m"],
            "current_outer_store_ratio_pct": current["outer_store_ratio_pct"],
            "current_inner_alley_ratio_pct": current["inner_alley_ratio_pct"],
            "current_exposure_store_count_20m": current["exposure_store_count_20m"],
            "forced_outer_possible": forced,
            "forced_outer_distance_m": forced_metrics["total_distance_m"],
            "forced_outer_distance_increase_vs_current_pct": pct_change(forced_metrics["total_distance_m"], current["total_distance_m"]),
            "forced_outer_distance_increase_vs_fast_pct": pct_change(forced_metrics["total_distance_m"], fast["total_distance_m"]),
            "forced_outer_store_ratio_pct": forced_metrics["outer_store_ratio_pct"],
            "forced_replaced_category": (info or {}).get("replaced_category", ""),
            "forced_outer_store_name": (info or {}).get("outer_store_name", ""),
        })
    avg_current_outer = mean(float(row["current_outer_store_ratio_pct"]) for row in rows)
    avg_current_inner = mean(float(row["current_inner_alley_ratio_pct"]) for row in rows)
    avg_current_exposure = mean(float(row["current_exposure_store_count_20m"]) for row in rows)
    possible = [row for row in rows if row["forced_outer_possible"]]
    avg_forced_increase = mean(float(row["forced_outer_distance_increase_vs_current_pct"]) for row in possible) if possible else 0
    detail_lines = "\n".join(
        f"| {row['scenario_id']} | {row['current_outer_store_ratio_pct']} | {row['current_inner_alley_ratio_pct']} | {row['current_exposure_store_count_20m']} | {row['forced_outer_possible']} | {row['forced_outer_distance_increase_vs_current_pct']} | {row['forced_replaced_category']} |"
        for row in rows
    )
    return f"""# 상생형 경로 정책 진단

## 진단 배경

현재 10개 고정 시나리오에서 상생형 경로의 외곽부 점포 포함률은 평균 {round(avg_current_outer, 2)}%로 나타났다. 따라서 현재 결과를 외곽부 점포 활성화 효과로 직접 해석하면 과장될 수 있다.

## 외곽부 점포가 포함되지 않은 이유

1. 후보 점포 재평가 단계에서 네트워크 접근 비용이 강하게 작동한다. 외곽부 점포는 중심 보행 네트워크에서 멀거나 점포-노드 연결거리가 길어 선택 비용이 커진다.
2. 고정 시나리오의 품목군은 중심부와 중간부에도 후보가 충분히 존재한다. 따라서 같은 품목군을 만족하는 더 가까운 점포가 우선 선택된다.
3. 상생형 비용 함수는 내부 골목 노출에는 보너스를 주지만, 외곽부 점포를 반드시 포함하는 하드 제약은 아니다.

## 현재 상생형의 현실적 해석

현재 상생형은 외곽부 점포 포함형이라기보다, **내부 골목 및 주변 권역 점포 노출형**으로 해석하는 것이 타당하다.

- 평균 내부 골목 통과율: {round(avg_current_inner, 2)}%
- 평균 경로 주변 20m 이내 노출 점포 수: {round(avg_current_exposure, 2)}개
- 평균 외곽부 점포 포함률: {round(avg_current_outer, 2)}%

## 외곽부 점포 최소 1개 포함 대안

외곽부 점포를 반드시 1개 이상 포함하도록 강제한 대안을 계산했다. 가능한 시나리오 수는 {len(possible)}개이며, 가능한 경우 현재 상생형 대비 평균 거리 증가율은 {round(avg_forced_increase, 2)}%였다.

| 시나리오 | 현재 외곽부 포함률(%) | 현재 내부 골목 비율(%) | 현재 노출 점포 수 | 외곽부 강제 가능 | 강제 시 거리 증가율(%) | 교체 품목군 |
|---|---:|---:|---:|---|---:|---|
{detail_lines}

## 결론

현재 보고서에서는 상생형을 “외곽부 활성화가 검증된 경로”라고 표현하지 않는 것이 적절하다. 대신 “내부 골목 및 주변 권역 점포 노출을 확대하는 경로”로 설명하고, 외곽부 점포 활성화는 향후 하드 제약 조건 또는 별도 정책 시나리오를 추가해야 달성 가능한 목표로 분리하는 것이 타당하다.
"""


def patch_final_summary():
    path = OUT / "final_validation_summary.md"
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "M0은 점포 좌표 사이의 직선거리만 사용하므로 실제 골목과 통로 연결을 반영하지 못한다.",
        "M0은 실제 성능 기준이 아니라 직선거리 왜곡 기준선이다. 점포 좌표 사이의 직선거리만 사용하므로 실제 골목과 통로 연결을 반영하지 못하며, 보행거리와 직접 비교할 때는 해석에 주의해야 한다.",
    )
    text = text.replace(
        "M4는 M3 순서 일부를 뒤집어 전체 비용이 줄어드는지 확인한다. 목적지가 많을수록 2-opt는 꼬인 방문 순서를 줄이는 후처리 장치로 의미가 있다.",
        "M4는 M3 순서 일부를 뒤집어 전체 비용이 줄어드는지 확인한다. 다만 현재 9개 품목 실험에서는 M3와 M4의 총 거리와 방향 전환 수가 동일하게 나타나, 2-opt가 추가 개선을 만들지는 않았다. 이는 Nearest-Neighbor 단계에서 이미 충분히 안정적인 순서가 형성되었기 때문으로 해석할 수 있다.",
    )
    text = text.replace(
        "이전에 확인한 1,003m에서 450m로 줄어든 결과는 단순 방문 순서 최적화만의 효과가 아니다. 후보 점포 재평가와 방문 순서 최적화가 함께 적용된 최종 시스템 개선 효과로 설명해야 한다.",
        "이전에 확인한 1,003m에서 449m 수준으로 줄어든 결과는 단순 방문 순서 최적화만의 효과가 아니다. 후보 점포 재평가와 방문 순서 최적화가 함께 적용된 최종 시스템 개선 효과로 설명해야 한다.",
    )
    text = text.replace(
        "상생형은 항상 최단 경로가 되는 것을 목표로 하지 않는다. 이동 부담을 과도하게 늘리지 않으면서 외곽부 점포, 주변 권역 점포, 내부 골목 노출을 확보하는 것이 목적이다. 10개 고정 시나리오에서 상생형은 빠른 장보기 대비 평균 거리 증가율 0.48%를 보였고, 평균 외곽부 점포 포함률은 0.0%, 경로 주변 20m 이내 노출 점포 수는 평균 111.2개였다.",
        "상생형은 항상 최단 경로가 되는 것을 목표로 하지 않는다. 다만 현재 10개 고정 시나리오에서는 외곽부 점포 포함률이 0.0%로 나타났으므로, 외곽부 활성화 효과를 검증했다고 과장해서는 안 된다. 현재 상생형은 외곽부 점포 포함형이라기보다 내부 골목 및 주변 권역 점포 노출형으로 해석하는 것이 타당하다. 빠른 장보기 대비 평균 거리 증가율은 0.48%였고, 경로 주변 20m 이내 노출 점포 수는 평균 111.2개였다. 외곽부 점포 활성화는 별도의 '외곽부 점포 최소 1개 포함' 같은 하드 제약을 추가한 정책 시나리오로 분리해 검토해야 한다.",
    )
    path.write_text(text, encoding="utf-8")


def main():
    analyzer = Analyzer()
    quality_rows, quality_md = store_connection_quality(analyzer)
    write_csv(OUT / "store_network_connection_quality.csv", quality_rows, ["store_id", "store_name", "shopping_category", "distance_zone", "direct_market_match", "nearest_node", "nearest_node_name", "distance_to_node_m", "coordinate_duplicate_count"])
    (OUT / "store_network_connection_quality.md").write_text(quality_md, encoding="utf-8")
    comparison_rows = fixed_store_route_type_comparison(analyzer)
    write_csv(OUT / "fixed_store_route_type_comparison.csv", comparison_rows, ["scenario_id", "scenario_categories", "fixed_store_sequence", "route_type", "total_distance_m", "expected_time_min", "turn_count", "cognitive_cost_sum", "main_aisle_ratio_pct", "inner_alley_ratio_pct", "transit_node_count"])
    (OUT / "winwin_policy_diagnostic.md").write_text(winwin_policy_diagnostic(analyzer), encoding="utf-8")
    patch_final_summary()
    print({"store_network_connection_quality_rows": len(quality_rows), "fixed_store_route_type_comparison_rows": len(comparison_rows), "winwin_policy_diagnostic": "written", "final_validation_summary": "patched"})


if __name__ == "__main__":
    main()
