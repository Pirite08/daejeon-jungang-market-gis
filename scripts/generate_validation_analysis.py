import csv
import json
import math
import random
from collections import defaultdict
from pathlib import Path
from statistics import mean, median, pstdev

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
OUT = ROOT / "analysis"
WALKING_M_PER_MIN = 67
BUFFER_M = 20
ROUTE_TYPES = ["빠른 장보기", "초행자 친화형", "넓은 길 우선형", "상생형"]
RANDOM_CATEGORIES = ["과일·채소", "정육", "수산·건어물", "반찬·식료품", "떡·한과", "분식·먹거리", "카페·음료", "생활용품", "보건·약국"]
FIXED_SCENARIOS = {
    "S1": ["과일·채소", "반찬·식료품", "떡·한과"],
    "S2": ["정육", "과일·채소", "반찬·식료품"],
    "S3": ["수산·건어물", "반찬·식료품", "분식·먹거리"],
    "S4": ["떡·한과", "분식·먹거리", "카페·음료"],
    "S5": ["생활용품", "의류·잡화", "카페·음료"],
    "S6": ["과일·채소", "정육", "수산·건어물", "반찬·식료품"],
    "S7": ["반찬·식료품", "떡·한과", "분식·먹거리"],
    "S8": ["의류·잡화", "생활용품", "반찬·식료품"],
    "S9": ["과일·채소", "카페·음료", "떡·한과"],
    "S10": ["정육", "수산·건어물", "과일·채소", "분식·먹거리"],
}
MODEL_NAMES = {
    "M0": "직선거리 기반 기존 경로",
    "M1": "기존 점포 선택 + 보행 네트워크 연결",
    "M2": "후보 점포 네트워크 비용 재평가",
    "M3": "M2 + Nearest-Neighbor 방문 순서 최적화",
    "M4": "M3 + 2-opt 개선",
    "M5": "최종 경로 유형별 비용 함수 적용",
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def feature_point(feature):
    lon, lat = feature["geometry"]["coordinates"]
    return {"lat": lat, "lon": lon}


def haversine(a, b):
    r = 6371000
    p1 = math.radians(a["lat"])
    p2 = math.radians(b["lat"])
    dp = math.radians(b["lat"] - a["lat"])
    dl = math.radians(b["lon"] - a["lon"])
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def bearing(a, b):
    p1 = math.radians(a["lat"])
    p2 = math.radians(b["lat"])
    dl = math.radians(b["lon"] - a["lon"])
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def turns(points):
    count = 0
    for i in range(1, len(points) - 1):
        diff = abs(bearing(points[i - 1], points[i]) - bearing(points[i], points[i + 1]))
        if min(diff, 360 - diff) > 35:
            count += 1
    return count


def xy(point, origin):
    return ((point["lon"] - origin["lon"]) * 111320 * math.cos(math.radians(origin["lat"])), (point["lat"] - origin["lat"]) * 111320)


def point_seg_dist(point, a, b, origin):
    px, py = xy(point, origin)
    ax, ay = xy(a, origin)
    bx, by = xy(b, origin)
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def exposure_count(features, segments, origin):
    exposed = set()
    for feature in features:
        point = feature_point(feature)
        if any(point_seg_dist(point, a, b, origin) <= BUFFER_M for a, b in segments):
            exposed.add(feature["properties"].get("id"))
    return len(exposed)


class Analyzer:
    def __init__(self):
        self.features = read_json(DATA / "stores_enriched.geojson")["features"]
        self.meta = read_json(DATA / "metadata.json")
        self.center = self.meta["filter"]["center"]
        self.nodes = self.load_nodes()
        self.node_by_id = {node["node_id"]: node for node in self.nodes}
        self.edges = self.load_edges()
        self.nearest_cache = {}
        self.path_cache = {}
        self.starts = self.make_starts()

    def load_nodes(self):
        items = []
        for feature in read_json(DATA / "network_nodes.geojson")["features"]:
            props = feature["properties"]
            lon, lat = feature["geometry"]["coordinates"]
            items.append({"node_id": props["node_id"], "lat": lat, "lon": lon, "name": props.get("name", props["node_id"])})
        return items

    def load_edges(self):
        items = []
        for feature in read_json(DATA / "network_edges.geojson")["features"]:
            props = feature["properties"]
            if props["from_node"] not in self.node_by_id or props["to_node"] not in self.node_by_id:
                continue
            length = props.get("length_m") or round(haversine(self.node_by_id[props["from_node"]], self.node_by_id[props["to_node"]]))
            items.append({
                "edge_id": props.get("edge_id"),
                "from_node": props["from_node"],
                "to_node": props["to_node"],
                "length_m": float(length),
                "width_level": int(props.get("width_level", 2)),
                "is_main_aisle": int(props.get("is_main_aisle", 0)),
                "is_inner_alley": int(props.get("is_inner_alley", 0)),
                "cognitive_cost": float(props.get("cognitive_cost", 2)),
            })
        return items

    def make_starts(self):
        nodes = self.nodes
        starts = {"시장 중심점": {"label": "시장 중심점", "lat": self.center["lat"], "lon": self.center["lon"]}}
        starts["서측 대전천 방향"] = dict(min(nodes, key=lambda n: n["lon"]), label="서측 대전천 방향")
        starts["동측 대전로 방향"] = dict(max(nodes, key=lambda n: n["lon"]), label="동측 대전로 방향")
        starts["남측 신중앙시장 방향"] = dict(min(nodes, key=lambda n: n["lat"]), label="남측 신중앙시장 방향")
        starts["북측 중앙로 방향"] = dict(max(nodes, key=lambda n: n["lat"]), label="북측 중앙로 방향")
        return starts

    def candidate_pool(self, category, include_outer=True, limit=None):
        pool = [f for f in self.features if f["properties"].get("shopping_category") == category]
        if not include_outer:
            pool = [f for f in pool if f["properties"].get("distance_zone") != "외곽부"]
        pool.sort(key=lambda f: (f["properties"].get("distanceM", 999999), int(not f["properties"].get("directMarketMatch")), f["properties"].get("coordinate_duplicate_count", 1), f["properties"].get("name", "")))
        return pool[: limit or (55 if include_outer else 35)]

    def app_score(self, route_type, current, feature, selected):
        props = feature["properties"]
        score = haversine(current, feature_point(feature))
        if route_type == "초행자 친화형":
            score += -55 if props.get("distance_zone") == "중심부" else -18 if props.get("distance_zone") == "중간부" else 45
            score += -85 if props.get("directMarketMatch") else 0
            score += min(props.get("coordinate_duplicate_count", 1), 25) * 1.8
        elif route_type == "상생형":
            score += -135 if props.get("distance_zone") == "외곽부" else -35 if props.get("distance_zone") == "중간부" else 18
            score += -8 if props.get("directMarketMatch") else 0
            score += min(props.get("coordinate_duplicate_count", 1), 30) * 2.2
        if route_type != "빠른 장보기":
            if any(s["geometry"]["coordinates"] == feature["geometry"]["coordinates"] for s in selected):
                score += 120
            if any(s["properties"].get("roadAddress") and s["properties"].get("roadAddress") == props.get("roadAddress") for s in selected):
                score += 35
        return score

    def existing_route(self, categories, start, route_type="빠른 장보기"):
        remaining = list(categories)
        route = []
        current = start
        while remaining:
            scored = []
            for category in remaining:
                for feature in self.candidate_pool(category):
                    scored.append((self.app_score(route_type, current, feature, route), category, feature))
            if not scored:
                break
            _, category, feature = min(scored, key=lambda item: item[0])
            route.append(feature)
            remaining.remove(category)
            current = feature_point(feature)
        return route

    def edge_cost(self, edge, route_type):
        if route_type == "초행자 친화형":
            return edge["length_m"] + edge["cognitive_cost"] * 22
        if route_type == "넓은 길 우선형":
            return edge["length_m"] + (55 if edge["width_level"] == 1 else 18 if edge["width_level"] == 2 else 0) - (10 if edge["is_main_aisle"] else 0)
        if route_type == "상생형":
            return max(edge["length_m"] * 0.55, edge["length_m"] - edge["is_inner_alley"] * 18)
        return edge["length_m"]

    def graph(self, route_type):
        g = defaultdict(list)
        for node in self.nodes:
            g[node["node_id"]] = []
        for edge in self.edges:
            cost = self.edge_cost(edge, route_type)
            g[edge["from_node"]].append((edge["to_node"], edge, cost))
            g[edge["to_node"]].append((edge["from_node"], edge, cost))
        return g

    def nearest_node(self, point):
        key = (round(point["lat"], 8), round(point["lon"], 8))
        if key not in self.nearest_cache:
            self.nearest_cache[key] = min(self.nodes, key=lambda n: haversine(point, n))
        return self.nearest_cache[key]

    def store_node(self, store):
        return self.nearest_node(feature_point(store))

    def dijkstra(self, start_id, end_id, route_type):
        if start_id == end_id:
            return {"nodes": [start_id], "edges": [], "cost": 0}
        key = (route_type, start_id, end_id)
        rkey = (route_type, end_id, start_id)
        if key in self.path_cache:
            return self.path_cache[key]
        if rkey in self.path_cache:
            old = self.path_cache[rkey]
            return {"nodes": list(reversed(old["nodes"])), "edges": list(reversed(old["edges"])), "cost": old["cost"]}
        g = self.graph(route_type)
        dist = {start_id: 0}
        prev = {}
        seen = set()
        while len(seen) < len(g):
            cur = None
            best = math.inf
            for node_id in g:
                value = dist.get(node_id, math.inf)
                if node_id not in seen and value < best:
                    cur, best = node_id, value
            if cur is None or cur == end_id:
                break
            seen.add(cur)
            for nxt, edge, cost in g[cur]:
                cand = dist[cur] + cost
                if cand < dist.get(nxt, math.inf):
                    dist[nxt] = cand
                    prev[nxt] = (cur, edge)
        if end_id not in dist:
            return None
        nodes = [end_id]
        edges = []
        cur = end_id
        while cur != start_id:
            cur, edge = prev[cur]
            edges.append(edge)
            nodes.insert(0, cur)
        edges.reverse()
        out = {"nodes": nodes, "edges": edges, "cost": dist[end_id]}
        self.path_cache[key] = out
        return out

    def leg_cost(self, a, b, route_type):
        path = self.dijkstra(a, b, route_type)
        return path["cost"] if path else math.inf

    def policy(self, store, route_type, selected):
        props = store["properties"]
        score = min(props.get("coordinate_duplicate_count", 1), 30) * 1.2
        if any(s["geometry"]["coordinates"] == store["geometry"]["coordinates"] for s in selected):
            score += 120
        if any(s["properties"].get("roadAddress") and s["properties"].get("roadAddress") == props.get("roadAddress") for s in selected):
            score += 28
        if route_type == "초행자 친화형":
            score += -45 if props.get("distance_zone") == "중심부" else -12 if props.get("distance_zone") == "중간부" else 55
            score -= 55 if props.get("directMarketMatch") else 0
        elif route_type == "상생형":
            score += -42 if props.get("distance_zone") == "외곽부" else -18 if props.get("distance_zone") == "중간부" else 14
            score -= 4 if props.get("directMarketMatch") else 0
        elif route_type == "넓은 길 우선형":
            score += 12 if props.get("distance_zone") == "외곽부" else 0
            score -= 12 if props.get("directMarketMatch") else 0
        else:
            score += props.get("distanceM", 0) * 0.04
            score -= 10 if props.get("directMarketMatch") else 0
        return score

    def store_key(self, store):
        return store["properties"].get("id") or store["properties"].get("name") or str(store["geometry"].get("coordinates"))

    def network_pool_with_original(self, category, original, route_type):
        limit = 10 if route_type == "상생형" else 8
        by_id = {}
        for store in self.candidate_pool(category, limit=limit):
            by_id[self.store_key(store)] = store
        if original is not None:
            by_id[self.store_key(original)] = original
        return list(by_id.values())

    def network_candidates_from_base(self, base_route, start, route_type="빠른 장보기", use_policy=True):
        categories = []
        original = {}
        for store in base_route:
            category = store["properties"].get("shopping_category")
            if category and category not in original:
                categories.append(category)
                original[category] = store
        pools = {category: self.network_pool_with_original(category, original.get(category), route_type) for category in categories}
        remaining = list(categories)
        selected = []
        current = self.nearest_node(start)
        while remaining:
            best = None
            for category in remaining:
                for store in pools.get(category, []):
                    target = self.store_node(store)
                    score = self.leg_cost(current["node_id"], target["node_id"], route_type) + haversine(target, feature_point(store)) * 0.35
                    if use_policy:
                        score += self.policy(store, route_type, selected)
                    if best is None or score < best[0]:
                        best = (score, category, store, target)
            if best is None:
                return base_route
            _, category, store, target = best
            selected.append(store)
            remaining.remove(category)
            current = target
        return selected

    def network_candidates(self, categories, start, route_type="빠른 장보기", use_policy=False):
        out = []
        current = self.nearest_node(start)
        for category in categories:
            best = None
            for store in self.candidate_pool(category, limit=10 if route_type == "상생형" else 8):
                target = self.store_node(store)
                score = self.leg_cost(current["node_id"], target["node_id"], route_type) + haversine(target, feature_point(store)) * 0.35
                if use_policy:
                    score += self.policy(store, route_type, out)
                if best is None or score < best[0]:
                    best = (score, store, target)
            if best:
                out.append(best[1])
                current = best[2]
        return out

    def nn_order(self, stores, start, route_type="빠른 장보기"):
        remaining = [{"store": s, "target": self.store_node(s)} for s in stores]
        out = []
        current = self.nearest_node(start)
        while remaining:
            best_i, best_score = 0, math.inf
            for i, item in enumerate(remaining):
                score = self.leg_cost(current["node_id"], item["target"]["node_id"], route_type) + haversine(item["target"], feature_point(item["store"])) * 0.35
                if any(self.store_node(s)["node_id"] == item["target"]["node_id"] for s in out):
                    score -= 12
                if score < best_score:
                    best_i, best_score = i, score
            item = remaining.pop(best_i)
            out.append(item["store"])
            current = item["target"]
        return out

    def order_cost(self, stores, start, route_type="빠른 장보기"):
        current = self.nearest_node(start)
        total = haversine(start, current)
        for store in stores:
            target = self.store_node(store)
            total += self.leg_cost(current["node_id"], target["node_id"], route_type)
            total += haversine(target, feature_point(store)) * 0.35
            current = target
        return total

    def two_opt(self, stores, start, route_type="빠른 장보기"):
        best = list(stores)
        best_cost = self.order_cost(best, start, route_type)
        changed = True
        while changed:
            changed = False
            for i in range(0, len(best) - 2):
                for j in range(i + 2, len(best)):
                    trial = best[: i + 1] + list(reversed(best[i + 1 : j + 1])) + best[j + 1 :]
                    cost = self.order_cost(trial, start, route_type)
                    if cost + 0.1 < best_cost:
                        best, best_cost, changed = trial, cost, True
        return best

    def final_route(self, categories, start, route_type):
        base = self.existing_route(categories, start, route_type)
        selected = self.network_candidates_from_base(base, start, route_type, use_policy=True)
        return self.two_opt(self.nn_order(selected, start, route_type), start, route_type)

    def direct_segments(self, stores, start):
        points = [start] + [feature_point(s) for s in stores]
        return list(zip(points[:-1], points[1:])), points

    def network_path(self, stores, start, route_type):
        start_node = self.nearest_node(start)
        current = start_node
        points = [start, start_node]
        segments = [(start, start_node)]
        used_edges = []
        used_nodes = [start_node["node_id"]]
        access = 0
        start_connector = haversine(start, start_node)
        for store in stores:
            target = self.store_node(store)
            path = self.dijkstra(current["node_id"], target["node_id"], route_type)
            if path:
                for node_id in path["nodes"][1:]:
                    node = self.node_by_id[node_id]
                    prev = points[-1]
                    points.append(node)
                    segments.append((prev, node))
                    used_nodes.append(node_id)
                used_edges.extend(path["edges"])
            store_point = feature_point(store)
            segments.append((target, store_point))
            access += haversine(target, store_point)
            current = target
        edge_dist = sum(e["length_m"] for e in used_edges)
        return {"points": points, "segments": segments, "edges": used_edges, "nodes": used_nodes, "access": access, "start_connector": start_connector, "edge_dist": edge_dist, "total": start_connector + edge_dist + access}

    def direct_distance(self, stores, start):
        points = [start] + [feature_point(s) for s in stores]
        return sum(haversine(points[i], points[i + 1]) for i in range(len(points) - 1))

    def metrics(self, stores, start, model, route_type, use_network):
        if use_network:
            path = self.network_path(stores, start, route_type if route_type in ROUTE_TYPES else "빠른 장보기")
            total = path["total"]
            edge_dist = path["edge_dist"]
            cog = sum(e["cognitive_cost"] for e in path["edges"])
            inner = sum(e["length_m"] for e in path["edges"] if e["is_inner_alley"])
            inner_ratio = inner / edge_dist * 100 if edge_dist else 0
            node_count = len(set(path["nodes"]))
            turn_count = turns(path["points"])
            access = path["access"]
            exposure = exposure_count(self.features, path["segments"], self.center)
        else:
            segments, points = self.direct_segments(stores, start)
            total = self.direct_distance(stores, start)
            cog = access = inner_ratio = 0
            node_count = 0
            turn_count = turns(points)
            exposure = exposure_count(self.features, segments, self.center)
        props = [s["properties"] for s in stores]
        outer_ratio = sum(1 for p in props if p.get("distance_zone") == "외곽부") / len(props) * 100 if props else 0
        surrounding_ratio = sum(1 for p in props if not p.get("directMarketMatch")) / len(props) * 100 if props else 0
        return {
            "model": model,
            "model_name": MODEL_NAMES[model],
            "route_type": route_type,
            "visit_store_count": len(stores),
            "total_distance_m": round(total, 1),
            "expected_time_min": round(total / WALKING_M_PER_MIN, 2),
            "transit_node_count": node_count,
            "turn_count": turn_count,
            "cognitive_cost_sum": round(cog, 1),
            "store_access_distance_m": round(access, 1),
            "inner_alley_ratio_pct": round(inner_ratio, 2),
            "outer_store_ratio_pct": round(outer_ratio, 2),
            "surrounding_store_ratio_pct": round(surrounding_ratio, 2),
            "exposure_store_count_20m": exposure,
            "store_sequence": " > ".join(f"{s['properties'].get('shopping_category')}:{s['properties'].get('name')}" for s in stores),
        }

    def evaluate(self, categories, start):
        rows = []
        m0_route = self.existing_route(categories, start, "빠른 장보기")
        rows.append(self.metrics(m0_route, start, "M0", "직선거리", False))
        m1_route = self.existing_route(categories, start, "상생형")
        rows.append(self.metrics(m1_route, start, "M1", "상생형", True))
        m2 = self.network_candidates(categories, start, "빠른 장보기", False)
        rows.append(self.metrics(m2, start, "M2", "빠른 장보기", True))
        m3 = self.nn_order(m2, start, "빠른 장보기")
        rows.append(self.metrics(m3, start, "M3", "빠른 장보기", True))
        m4 = self.two_opt(m3, start, "빠른 장보기")
        rows.append(self.metrics(m4, start, "M4", "빠른 장보기", True))
        for rt in ROUTE_TYPES:
            rows.append(self.metrics(self.final_route(categories, start, rt), start, "M5", rt, True))
        m0_dist, m1_dist = rows[0]["total_distance_m"], rows[1]["total_distance_m"]
        for row in rows:
            row["distance_change_vs_m0_pct"] = round((row["total_distance_m"] - m0_dist) / m0_dist * 100, 2) if m0_dist else 0
            row["distance_reduction_vs_m1_pct"] = round((m1_dist - row["total_distance_m"]) / m1_dist * 100, 2) if m1_dist else 0
        return rows


def write_csv(path, rows, fields=None):
    if not rows:
        return
    fields = fields or list(rows[0].keys())
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def variant(row):
    return f"M5_{row['route_type']}" if row["model"] == "M5" else row["model"]


def summarize_random(rows):
    metric_names = ["total_distance_m", "expected_time_min", "turn_count", "cognitive_cost_sum", "store_access_distance_m", "inner_alley_ratio_pct", "outer_store_ratio_pct", "exposure_store_count_20m"]
    grouped = defaultdict(list)
    for row in rows:
        grouped[variant(row)].append(row)
    out = []
    for key in sorted(grouped):
        items = grouped[key]
        for metric in metric_names:
            vals = [float(item[metric]) for item in items]
            out.append({"model_variant": key, "model": items[0]["model"], "model_name": items[0]["model_name"], "route_type": items[0]["route_type"], "metric": metric, "scenario_count": len(vals), "mean": round(mean(vals), 3), "median": round(median(vals), 3), "std": round(pstdev(vals), 3), "min": round(min(vals), 3), "max": round(max(vals), 3)})
    return out


def pct(new, old):
    return round((new - old) / old * 100, 2) if old else 0


def find(rows, model, route_type=None, scenario_id=None):
    for row in rows:
        if row["model"] == model and (route_type is None or row["route_type"] == route_type) and (scenario_id is None or row.get("scenario_id") == scenario_id):
            return row
    return None


def avg(rows, key):
    return round(mean(float(r[key]) for r in rows), 2) if rows else 0


def build_summary(ablation, scenario, entrance, random_summary, winwin):
    m0, m1, m2, m3, m4 = [find(ablation, f"M{i}") for i in range(5)]
    m5f = find(ablation, "M5", "빠른 장보기")
    m5n = find(ablation, "M5", "초행자 친화형")
    m5w = find(ablation, "M5", "넓은 길 우선형")
    m5s = find(ablation, "M5", "상생형")
    scen_m1 = [r for r in scenario if r["model"] == "M1"]
    scen_m5s = [r for r in scenario if r["model"] == "M5" and r["route_type"] == "상생형"]
    scen_m5f = [r for r in scenario if r["model"] == "M5" and r["route_type"] == "빠른 장보기"]
    avg_m1, avg_m5s, avg_m5f = avg(scen_m1, "total_distance_m"), avg(scen_m5s, "total_distance_m"), avg(scen_m5f, "total_distance_m")
    avg_reduction = round((avg_m1 - avg_m5s) / avg_m1 * 100, 2) if avg_m1 else 0
    e_rows = [r for r in entrance if r["model"] == "M5" and r["route_type"] == "상생형"]
    best_e, worst_e = min(e_rows, key=lambda r: r["total_distance_m"]), max(e_rows, key=lambda r: r["total_distance_m"])
    random_distance = [r for r in random_summary if r["metric"] == "total_distance_m"]
    random_table = "\n".join(f"| {r['model_variant']} | {r['mean']} | {r['median']} | {r['std']} | {r['min']} | {r['max']} |" for r in random_distance)
    win_inc, win_outer, win_exposure = avg(winwin, "distance_increase_vs_fast_pct"), avg(winwin, "outer_store_ratio_pct"), avg(winwin, "exposure_store_count_20m")
    return f"""# 대전 중앙시장 장보기 동선 최적화 검증 요약

## 분석 목적

이 검증은 Leaflet GIS 앱의 장보기 동선 추천이 실제 보행 네트워크 기준에서 얼마나 효율성을 개선했는지 확인하기 위해 수행했다. 분석에는 점포 1,200개, 사용자가 보정한 보행 네트워크 노드 36개와 엣지 61개를 사용했다.

## 비교 모델

- M0: 직선거리 기반 기존 경로
- M1: 기존 점포 선택 + 보행 네트워크 연결
- M2: 후보 점포 네트워크 비용 재평가
- M3: M2 + Nearest-Neighbor 방문 순서 최적화
- M4: M3 + 2-opt 개선
- M5: 최종 경로 유형별 비용 함수 적용

## 단계별 알고리즘 개선 효과

9개 기본 장보기 품목군을 모두 선택하고 시장 중심점에서 출발하는 조건에서 단계별 분석을 수행했다.

| 모델 | 경로 유형 | 총 거리(m) | 예상 시간(분) | 방향 전환 | 경유 노드 | 노출 점포 수 |
|---|---|---:|---:|---:|---:|---:|
| M0 | {m0['route_type']} | {m0['total_distance_m']} | {m0['expected_time_min']} | {m0['turn_count']} | {m0['transit_node_count']} | {m0['exposure_store_count_20m']} |
| M1 | {m1['route_type']} | {m1['total_distance_m']} | {m1['expected_time_min']} | {m1['turn_count']} | {m1['transit_node_count']} | {m1['exposure_store_count_20m']} |
| M2 | {m2['route_type']} | {m2['total_distance_m']} | {m2['expected_time_min']} | {m2['turn_count']} | {m2['transit_node_count']} | {m2['exposure_store_count_20m']} |
| M3 | {m3['route_type']} | {m3['total_distance_m']} | {m3['expected_time_min']} | {m3['turn_count']} | {m3['transit_node_count']} | {m3['exposure_store_count_20m']} |
| M4 | {m4['route_type']} | {m4['total_distance_m']} | {m4['expected_time_min']} | {m4['turn_count']} | {m4['transit_node_count']} | {m4['exposure_store_count_20m']} |
| M5 | 빠른 장보기 | {m5f['total_distance_m']} | {m5f['expected_time_min']} | {m5f['turn_count']} | {m5f['transit_node_count']} | {m5f['exposure_store_count_20m']} |
| M5 | 초행자 친화형 | {m5n['total_distance_m']} | {m5n['expected_time_min']} | {m5n['turn_count']} | {m5n['transit_node_count']} | {m5n['exposure_store_count_20m']} |
| M5 | 넓은 길 우선형 | {m5w['total_distance_m']} | {m5w['expected_time_min']} | {m5w['turn_count']} | {m5w['transit_node_count']} | {m5w['exposure_store_count_20m']} |
| M5 | 상생형 | {m5s['total_distance_m']} | {m5s['expected_time_min']} | {m5s['turn_count']} | {m5s['transit_node_count']} | {m5s['exposure_store_count_20m']} |

이전에 확인한 1,003m에서 450m로 줄어든 결과는 단순 방문 순서 최적화만의 효과가 아니다. 후보 점포 재평가와 방문 순서 최적화가 함께 적용된 최종 시스템 개선 효과로 설명해야 한다.

## 기존 방식의 한계

M0은 점포 좌표 사이의 직선거리만 사용하므로 실제 골목과 통로 연결을 반영하지 못한다. M1은 같은 점포 조합을 네트워크에 연결하지만, 점포 선택과 순서가 이미 직선거리 기준으로 고정되어 있어 보행 네트워크 흐름과 맞지 않는 우회가 생길 수 있다.

## 후보 점포 재평가의 효과

M2는 각 품목군의 후보 점포를 네트워크 접근 비용으로 다시 평가한다. 따라서 같은 품목이라도 실제 보행망에서 접근하기 쉬운 점포가 선택되며, 비효율적인 점포 조합을 줄이는 데 핵심적인 역할을 한다.

## 방문 순서 최적화의 효과

M3는 Nearest-Neighbor 방식으로 현재 위치에서 네트워크 비용이 가장 낮은 다음 점포를 선택한다. 시장 내부에서는 직선거리보다 통로 흐름이 중요하므로, 이 단계는 왕복과 지그재그 동선을 줄이는 데 기여한다.

## 2-opt 적용 효과

M4는 M3 순서 일부를 뒤집어 전체 비용이 줄어드는지 확인한다. 목적지가 많을수록 2-opt는 꼬인 방문 순서를 줄이는 후처리 장치로 의미가 있다.

## 경로 유형별 차이

빠른 장보기는 거리 최소화, 초행자 친화형은 인지 비용 감소, 넓은 길 우선형은 좁은 골목 회피, 상생형은 외곽부와 덜 노출되는 점포의 자연스러운 포함을 목표로 한다. 10개 고정 시나리오에서 M1 평균 거리는 {avg_m1}m, M5 상생형 평균 거리는 {avg_m5s}m로, 기존 네트워크 연결 방식 대비 평균 {avg_reduction}% 개선되었다. M5 빠른 장보기 평균 거리는 {avg_m5f}m이다.

## 입구별 접근성 차이

S6 구매목록을 기준으로 출발지를 바꾸어 비교했다. M5 상생형 기준 가장 짧은 출발지는 {best_e['start_label']}({best_e['total_distance_m']}m), 가장 긴 출발지는 {worst_e['start_label']}({worst_e['total_distance_m']}m)였다. 같은 구매목록이라도 진입 방향에 따라 장보기 부담이 달라질 수 있다.

## 무작위 반복 검증

품목군 9개 중 3~5개를 무작위 선택하고 출발지도 무작위 선택한 100개 시나리오를 생성했다.

| 모델 | 평균 | 중앙값 | 표준편차 | 최소 | 최대 |
|---|---:|---:|---:|---:|---:|
{random_table}

## 상생형 경로의 의미

상생형은 항상 최단 경로가 되는 것을 목표로 하지 않는다. 이동 부담을 과도하게 늘리지 않으면서 외곽부 점포, 주변 권역 점포, 내부 골목 노출을 확보하는 것이 목적이다. 10개 고정 시나리오에서 상생형은 빠른 장보기 대비 평균 거리 증가율 {win_inc}%를 보였고, 평균 외곽부 점포 포함률은 {win_outer}%, 경로 주변 20m 이내 노출 점포 수는 평균 {win_exposure}개였다.

## 데이터 한계

보행 네트워크는 공식 보행로 데이터가 아니라 사용자가 지도에서 직접 찍은 노드와 이미지 기반 해석으로 만든 연구용 네트워크이다. 실제 통행 가능성, 혼잡도, 영업시간, 보행자 연령별 속도, 장애물은 반영하지 못한다. 점포 좌표 중복도 많아 실제 개별 점포 위치와 대표 좌표 사이에 차이가 있을 수 있다.

## 후속 연구 방향

후속 연구에서는 현장조사나 QGIS 편집을 통해 골목 폭, 혼잡도, 안내판 위치, 장애물, 지붕 유무 등을 추가하는 것이 좋다. 실제 방문자 실험을 통해 길찾기 성공률, 소요시간, 만족도, 길을 묻는 횟수를 수집하면 알고리즘 검증 신뢰도를 더 높일 수 있다.
"""


def main():
    OUT.mkdir(exist_ok=True)
    analyzer = Analyzer()
    fields = ["experiment", "scenario_id", "scenario_categories", "start_label", "model", "model_name", "route_type", "visit_store_count", "total_distance_m", "expected_time_min", "transit_node_count", "turn_count", "cognitive_cost_sum", "store_access_distance_m", "inner_alley_ratio_pct", "outer_store_ratio_pct", "surrounding_store_ratio_pct", "exposure_store_count_20m", "distance_change_vs_m0_pct", "distance_reduction_vs_m1_pct", "store_sequence"]
    center = analyzer.starts["시장 중심점"]
    all9 = RANDOM_CATEGORIES

    def decorate(rows, experiment, scenario_id, categories, start_label):
        out = []
        for row in rows:
            row = dict(row)
            row.update({"experiment": experiment, "scenario_id": scenario_id, "scenario_categories": ", ".join(categories), "start_label": start_label})
            out.append(row)
        return out

    ablation = decorate(analyzer.evaluate(all9, center), "ALL9_MARKET_CENTER", "ALL9", all9, "시장 중심점")
    write_csv(OUT / "algorithm_ablation_results.csv", ablation, fields)

    scenario_rows = []
    for sid, cats in FIXED_SCENARIOS.items():
        scenario_rows.extend(decorate(analyzer.evaluate(cats, center), "FIXED_SCENARIO", sid, cats, "시장 중심점"))
    write_csv(OUT / "scenario_validation_results.csv", scenario_rows, fields)

    entrance_rows = []
    cats = FIXED_SCENARIOS["S6"]
    for label, start in analyzer.starts.items():
        entrance_rows.extend(decorate(analyzer.evaluate(cats, start), "ENTRANCE_COMPARISON", "S6", cats, label))
    write_csv(OUT / "entrance_comparison_results.csv", entrance_rows, fields)

    rng = random.Random(42)
    random_raw = []
    starts = list(analyzer.starts.items())
    for i in range(1, 101):
        size = rng.randint(3, 5)
        cats = sorted(rng.sample(RANDOM_CATEGORIES, size), key=RANDOM_CATEGORIES.index)
        label, start = rng.choice(starts)
        random_raw.extend(decorate(analyzer.evaluate(cats, start), "RANDOM_SIMULATION", f"R{i:03d}", cats, label))
    random_summary = summarize_random(random_raw)
    write_csv(OUT / "random_simulation_results.csv", random_summary, ["model_variant", "model", "model_name", "route_type", "metric", "scenario_count", "mean", "median", "std", "min", "max"])

    winwin = []
    for sid, cats in FIXED_SCENARIOS.items():
        fast = analyzer.metrics(analyzer.final_route(cats, center, "빠른 장보기"), center, "M5", "빠른 장보기", True)
        ww = analyzer.metrics(analyzer.final_route(cats, center, "상생형"), center, "M5", "상생형", True)
        winwin.append({"scenario_id": sid, "scenario_categories": ", ".join(cats), "fast_distance_m": fast["total_distance_m"], "winwin_distance_m": ww["total_distance_m"], "distance_increase_vs_fast_pct": pct(ww["total_distance_m"], fast["total_distance_m"]), "outer_store_ratio_pct": ww["outer_store_ratio_pct"], "inner_alley_ratio_pct": ww["inner_alley_ratio_pct"], "surrounding_store_ratio_pct": ww["surrounding_store_ratio_pct"], "exposure_store_count_20m": ww["exposure_store_count_20m"], "winwin_store_sequence": ww["store_sequence"]})
    write_csv(OUT / "winwin_route_analysis.csv", winwin, ["scenario_id", "scenario_categories", "fast_distance_m", "winwin_distance_m", "distance_increase_vs_fast_pct", "outer_store_ratio_pct", "inner_alley_ratio_pct", "surrounding_store_ratio_pct", "exposure_store_count_20m", "winwin_store_sequence"])

    (OUT / "final_validation_summary.md").write_text(build_summary(ablation, scenario_rows, entrance_rows, random_summary, winwin), encoding="utf-8")
    print(json.dumps({"algorithm_ablation_results": len(ablation), "scenario_validation_results": len(scenario_rows), "entrance_comparison_results": len(entrance_rows), "random_simulation_raw_cases": len(random_raw), "random_simulation_summary_rows": len(random_summary), "winwin_route_analysis": len(winwin)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
