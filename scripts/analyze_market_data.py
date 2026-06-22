import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "site" / "data"
ANALYSIS_DIR = ROOT / "analysis"


def zone_for(distance_m):
    if distance_m is None:
        return "거리 정보 없음"
    if distance_m <= 100:
        return "중심부"
    if distance_m <= 200:
        return "중간부"
    return "외곽부"


def write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    geojson_path = DATA_DIR / "stores.geojson"
    metadata_path = DATA_DIR / "metadata.json"

    geojson = json.loads(geojson_path.read_text(encoding="utf-8"))
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    features = geojson["features"]
    props_list = [feature["properties"] for feature in features]

    total_count = len(features)
    direct_count = sum(1 for props in props_list if props.get("directMarketMatch"))
    surrounding_count = total_count - direct_count

    large_counts = Counter(props.get("category", "미분류") for props in props_list)
    middle_counts = Counter(props.get("middleCategory", "미분류") for props in props_list)
    small_counts = Counter(props.get("smallCategory", "미분류") for props in props_list)
    coord_counts = Counter(tuple(feature["geometry"]["coordinates"]) for feature in features)
    address_counts = Counter(props.get("roadAddress") or "주소 정보 없음" for props in props_list)
    zone_counts = Counter(zone_for(props.get("distanceM")) for props in props_list)

    zone_category_counts = defaultdict(Counter)
    for props in props_list:
        zone_category_counts[zone_for(props.get("distanceM"))][props.get("category", "미분류")] += 1

    category_rows = []
    for level_name, counter in [
        ("대분류", large_counts),
        ("중분류", middle_counts),
        ("소분류", small_counts),
    ]:
        for name, count in counter.most_common():
            category_rows.append(
                {
                    "분류수준": level_name,
                    "분류명": name,
                    "점포수": count,
                    "비율": round(count / total_count * 100, 2) if total_count else 0,
                }
            )

    duplicate_rows = []
    features_by_coord = defaultdict(list)
    for feature in features:
        features_by_coord[tuple(feature["geometry"]["coordinates"])].append(feature)
    for coord, grouped in sorted(features_by_coord.items(), key=lambda item: -len(item[1])):
        first = grouped[0]["properties"]
        duplicate_rows.append(
            {
                "경도": coord[0],
                "위도": coord[1],
                "중복점포수": len(grouped),
                "대표도로명주소": first.get("roadAddress") or "주소 정보 없음",
                "대표건물명": first.get("building") or "",
                "대표점포명": first.get("name") or "",
                "직접매칭점포수": sum(
                    1 for feature in grouped if feature["properties"].get("directMarketMatch")
                ),
            }
        )

    distance_zone_rows = []
    for zone in ["중심부", "중간부", "외곽부"]:
        zone_total = zone_counts.get(zone, 0)
        top_categories = ", ".join(
            f"{name} {count}개" for name, count in zone_category_counts[zone].most_common(5)
        )
        distance_zone_rows.append(
            {
                "거리구간": zone,
                "점포수": zone_total,
                "비율": round(zone_total / total_count * 100, 2) if total_count else 0,
                "주요업종Top5": top_categories,
            }
        )

    write_csv(
        ANALYSIS_DIR / "category_summary.csv",
        category_rows,
        ["분류수준", "분류명", "점포수", "비율"],
    )
    write_csv(
        ANALYSIS_DIR / "coordinate_duplicates.csv",
        duplicate_rows,
        ["경도", "위도", "중복점포수", "대표도로명주소", "대표건물명", "대표점포명", "직접매칭점포수"],
    )
    write_csv(
        ANALYSIS_DIR / "distance_zone_summary.csv",
        distance_zone_rows,
        ["거리구간", "점포수", "비율", "주요업종Top5"],
    )

    summary = {
        "sourceDate": metadata.get("sourceDate"),
        "totalStores": total_count,
        "directMarketMatches": direct_count,
        "surroundingStores": surrounding_count,
        "uniqueCoordinates": len(coord_counts),
        "duplicateCoordinateGroups": sum(1 for count in coord_counts.values() if count > 1),
        "maxStoresAtOneCoordinate": max(coord_counts.values()) if coord_counts else 0,
        "uniqueRoadAddresses": len(address_counts),
        "maxStoresAtOneRoadAddress": max(address_counts.values()) if address_counts else 0,
        "largeCategoryCounts": dict(large_counts.most_common()),
        "distanceZoneCounts": dict(zone_counts),
        "topDuplicateCoordinates": duplicate_rows[:10],
        "distanceZoneSummary": distance_zone_rows,
    }
    (DATA_DIR / "analysis-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    large_md = "\n".join(
        f"- {name}: {count}개 ({count / total_count * 100:.1f}%)"
        for name, count in large_counts.most_common()
    )
    duplicate_md = "\n".join(
        f"- {row['대표도로명주소']} / {row['대표건물명'] or '건물명 없음'}: {row['중복점포수']}개"
        for row in duplicate_rows[:10]
    )
    zone_md = "\n".join(
        f"- {row['거리구간']}: {row['점포수']}개 ({row['비율']}%), 주요 업종: {row['주요업종Top5']}"
        for row in distance_zone_rows
    )

    report = f"""# 대전 중앙시장권역 점포 데이터 품질 진단

## 1. 데이터 개요

- 원천 기준일: {metadata.get("sourceDate")}
- 분석 대상: {metadata.get("filter", {}).get("region")}
- 중심 좌표: 위도 {metadata.get("filter", {}).get("center", {}).get("lat")}, 경도 {metadata.get("filter", {}).get("center", {}).get("lon")}
- 분석 반경: {metadata.get("filter", {}).get("radiusM")}m
- 전체 점포 수: {total_count}개
- 중앙시장명 직접 매칭 점포 수: {direct_count}개
- 주변 권역 점포 수: {surrounding_count}개

## 2. 업종 대분류 분포

{large_md}

## 3. 좌표 중복 진단

- 고유 좌표 수: {len(coord_counts)}개
- 중복 좌표 그룹 수: {sum(1 for count in coord_counts.values() if count > 1)}개
- 한 좌표에 겹친 최대 점포 수: {max(coord_counts.values()) if coord_counts else 0}개
- 고유 도로명주소 수: {len(address_counts)}개
- 한 도로명주소에 겹친 최대 점포 수: {max(address_counts.values()) if address_counts else 0}개

중복 점포가 많은 상위 지점은 다음과 같다.

{duplicate_md}

## 4. 중심점 거리 구간별 분포

거리 구간은 중심점으로부터 0~100m를 중심부, 100~200m를 중간부, 200~300m를 외곽부로 구분했다.

{zone_md}

## 5. 연구 활용 가능성

현재 데이터는 대전 중앙시장권역의 점포 위치와 업종 구성을 넓게 파악하는 데 유용하다. 업종별 분포, 시장명 직접 매칭 점포와 주변 권역 점포의 차이, 중심부와 외곽부의 점포 구성 차이를 분석할 수 있다. 또한 구매목록 기반 후보 점포 추천을 위한 기초 데이터로 활용할 수 있다.

## 6. 데이터 한계

현재 `stores.geojson`의 좌표는 개별 점포 출입구 단위의 정밀 좌표라기보다 주소 또는 건물 대표점 좌표에 가깝다. 실제로 동일 좌표에 여러 점포가 겹치는 사례가 많고, 한 좌표에 최대 {max(coord_counts.values()) if coord_counts else 0}개 점포가 배치되어 있다. 따라서 이 데이터만으로 시장 내부 골목 단위의 실제 보행 최단 경로를 구현했다고 주장해서는 안 된다.

현재 프로젝트에는 시장 내부 보행로, 골목, 출입구, 교차점, 통로 폭, 혼잡도, 방향 전환 난이도 같은 네트워크 데이터가 아직 없다. 그러므로 현 단계의 경로 추천은 실제 길찾기 결과가 아니라 점포 분포와 직선거리 기반의 예비 동선 분석으로 해석해야 한다.

향후 QGIS 또는 현장조사를 통해 보행 네트워크를 구축하면 출입구 기준 접근성, 방향 전환 수, 초행자 인지 비용, 혼잡 회피, 소외 골목 노출 효과를 반영한 네트워크 기반 경로 최적화로 확장할 수 있다.
"""
    (ANALYSIS_DIR / "data_quality_report.md").write_text(report, encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
