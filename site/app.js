const SHOPPING_CATEGORIES = [
  "과일·채소",
  "정육",
  "수산·건어물",
  "반찬·식료품",
  "떡·한과",
  "분식·먹거리",
  "카페·음료",
  "의류·잡화",
  "생활용품",
  "보건·약국",
  "기타 소매",
  "기타 음식",
  "비장보기 업종",
];

const ROUTE_TYPES = ["빠른 장보기", "초행자 친화형", "넓은 길 우선형", "상생형"];
const WALKING_M_PER_MIN = 67;
const ROUTE_CONFIG = {
  "빠른 장보기": {
    color: "#dc2626",
    label: "거리 최소화 우선",
  },
  "초행자 친화형": {
    color: "#2563eb",
    label: "중심부·직접 매칭 우선",
  },
  "넓은 길 우선형": {
    color: "#0891b2",
    label: "좁은 골목 회피와 넓은 보행축 우선",
  },
  "상생형": {
    color: "#7c3aed",
    label: "외곽부·덜 노출 점포 포함 시도",
  },
};

const state = {
  features: [],
  metadata: null,
  shoppingSummary: null,
  scenarioResults: [],
  markers: new Map(),
  selectedId: null,
  heatMode: false,
  duplicateMode: false,
  routeType: "빠른 장보기",
  routeResults: {},
  customStart: null,
  entrances: [],
  highlightedIds: new Set(),
};

const colors = {
  direct: "#be3a34",
  area: "#0f766e",
  outer: "#d97706",
  marketCore: "#f59e0b",
  analysisRange: "#2563eb",
};

function injectResearchUi() {
  const controls = document.querySelector(".controls");
  const breakdown = document.querySelector(".breakdown");
  const toolbar = document.querySelector(".map-toolbar");
  const legend = document.querySelector(".legend");

  if (controls && !document.querySelector("#shoppingCategorySelect")) {
    controls.insertAdjacentHTML(
      "beforeend",
      `
      <label class="search-label" for="shoppingCategorySelect">장보기 품목군</label>
      <select id="shoppingCategorySelect"><option value="">전체 품목군</option></select>
      <label class="search-label" for="zoneSelect">거리 구간</label>
      <select id="zoneSelect">
        <option value="">전체 구간</option>
        <option value="중심부">중심부(0~100m)</option>
        <option value="중간부">중간부(100~200m)</option>
        <option value="외곽부">외곽부(200~300m)</option>
      </select>
      <label class="single-toggle"><input id="duplicateMode" type="checkbox" /> 좌표 중복 보기</label>
      <label class="single-toggle"><input id="showCoreArea" type="checkbox" checked /> 핵심 시장 구역(추정)</label>
      <label class="single-toggle"><input id="showDistanceRings" type="checkbox" checked /> 중심부·중간부·외곽부 표시</label>
    `
    );
  }

  if (breakdown && !document.querySelector("#shoppingBars")) {
    breakdown.insertAdjacentHTML(
      "afterend",
      `
      <section class="analysis-panel" aria-label="연구 분석 요약">
        <h2>연구 모드</h2>
        <p class="research-note">현재 경로는 실제 보행 네트워크가 아니라 점포 좌표 간 직선거리 기반 예비 분석입니다.</p>
        <p class="research-note">중앙시장 핵심 구역은 시장명 직접 매칭 점포의 분포를 이용한 추정 polygon이며, 공식 경계가 아닙니다.</p>
        <div id="analysisMetrics" class="analysis-metrics"></div>
        <h3>장보기 품목군 Top 5</h3>
        <div id="shoppingBars" class="mini-bars"></div>
        <h3>좌표 중복 한계</h3>
        <p id="duplicateSummary" class="research-note"></p>
      </section>
      <section class="route-panel" aria-label="장보기 경로 추천">
        <h2>장보기 목록 기반 추천</h2>
        <label class="search-label" for="startMode">출발 기준점</label>
        <select id="startMode"></select>
        <p id="startDescription" class="research-note"></p>
        <div id="shoppingChecklist" class="shopping-checklist"></div>
        <label class="single-toggle"><input id="includeOuter" type="checkbox" checked /> 외곽부 점포 후보 포함</label>
        <label class="single-toggle"><input id="diversityMode" type="checkbox" checked /> 경로 다양성 높이기</label>
        <div id="routeButtons" class="route-buttons"></div>
        <div id="candidateResults" class="candidate-results"></div>
        <div id="routeResults" class="route-results"></div>
        <h3>경로 유형별 비교</h3>
        <div id="routeComparison" class="route-comparison"></div>
        <h3>입구별 경로 비교</h3>
        <div id="entranceComparison" class="route-comparison"></div>
        <h3>반복 원인 진단</h3>
        <div id="routeDiagnostics" class="route-diagnostics"></div>
        <h3>점수 계산 요소</h3>
        <div id="scoreDebug" class="score-debug"></div>
        <h3>시나리오 분석 요약</h3>
        <div id="scenarioSummary" class="scenario-summary"></div>
      </section>
    `
    );
  }

  if (toolbar && !document.querySelector("#networkNotice")) {
    toolbar.insertAdjacentHTML(
      "afterend",
      `<div id="networkNotice" class="network-notice">예비 연결선: 실제 보행 경로 아님</div>`
    );
  }

  if (legend) {
    legend.innerHTML = `
      <span><i class="dot direct"></i>직접 매칭 점포</span>
      <span><i class="dot area"></i>주변 권역 점포</span>
      <span><i class="legend-swatch core"></i>중앙시장 핵심 구역(추정)</span>
      <span><i class="legend-swatch range"></i>주변 상권 분석 범위 300m</span>
      <span><i class="route-line fast"></i>빠른 장보기: 거리 최소</span>
      <span><i class="route-line newcomer"></i>초행자: 중심부·직접 매칭</span>
      <span><i class="route-line wide"></i>넓은 길: 좁은 골목 회피</span>
      <span><i class="route-line coexist"></i>상생형: 외곽부 노출</span>
    `;
  }

  if (!document.querySelector("#analysisDynamicStyles")) {
    document.head.insertAdjacentHTML(
      "beforeend",
      `
      <style id="analysisDynamicStyles">
        .single-toggle{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:8px;display:flex;font-size:13px;gap:8px;min-height:38px;padding:8px 10px}
        .analysis-panel,.route-panel{border-top:1px solid var(--line);display:grid;gap:10px;margin-top:14px;padding-top:14px}
        .analysis-panel h3,.route-panel h3{font-size:13px;margin:4px 0 0}
        .research-note,.empty-note,.list-note{color:var(--muted);font-size:12px;line-height:1.5;margin:0}
        .analysis-metrics{display:grid;gap:8px;grid-template-columns:repeat(2,1fr)}
        .analysis-metrics div{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px}
        .analysis-metrics strong{display:block;font-size:18px}.analysis-metrics span{color:var(--muted);font-size:11px}
        .mini-bars{display:grid;gap:7px}.shopping-checklist{display:grid;gap:6px;grid-template-columns:1fr 1fr}
        .shopping-checklist label{background:#fff;border:1px solid var(--line);border-radius:8px;font-size:12px;padding:7px}
        .route-buttons{display:grid;gap:6px;grid-template-columns:repeat(2,1fr)}
        .route-buttons button{background:#fff;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:12px;font-weight:800;min-height:34px}
        .route-buttons button.active{color:#fff}.route-buttons button[data-route-type="빠른 장보기"].active{background:#dc2626;border-color:#dc2626}.route-buttons button[data-route-type="초행자 친화형"].active{background:#2563eb;border-color:#2563eb}.route-buttons button[data-route-type="넓은 길 우선형"].active{background:#0891b2;border-color:#0891b2}.route-buttons button[data-route-type="상생형"].active{background:#7c3aed;border-color:#7c3aed}
        .candidate-results{display:grid;gap:10px}.candidate-group{display:grid;gap:6px}.candidate-card{background:#fff;border:1px solid var(--line);border-radius:8px;cursor:pointer;display:grid;gap:4px;padding:10px;text-align:left;width:100%}.candidate-card span{color:var(--muted);font-size:12px}
        .route-summary{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px}.route-summary p{color:var(--muted);font-size:12px;line-height:1.5;margin:4px 0 8px}.route-metrics{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.route-metrics span{background:#fff;border:1px solid var(--line);border-radius:999px;font-size:11px;padding:5px 8px}.route-summary ol{font-size:12px;line-height:1.55;margin:8px 0 0;padding-left:18px}
        .route-comparison table,.score-debug table{border-collapse:collapse;font-size:11px;width:100%}.route-comparison th,.route-comparison td,.score-debug th,.score-debug td{border:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}.route-comparison th,.score-debug th{background:var(--surface)}
        .route-diagnostics{display:grid;gap:6px}.diagnostic-item{background:#fff;border:1px solid var(--line);border-radius:8px;color:var(--muted);font-size:12px;line-height:1.45;padding:8px}
        .scenario-summary{display:grid;gap:6px}.scenario-row{background:#fff;border:1px solid var(--line);border-radius:8px;display:grid;gap:3px;padding:8px}.scenario-row span{color:var(--muted);font-size:11px}
        .route-number-icon span{align-items:center;border:3px solid #fff;border-radius:999px;box-shadow:0 10px 24px rgba(0,0,0,.42);color:#fff;display:flex;font-size:14px;font-weight:900;height:34px;justify-content:center;width:34px}
        .route-arrow-icon span{align-items:center;border:3px solid #fff;border-radius:999px;box-shadow:0 8px 20px rgba(0,0,0,.36);color:#fff;display:flex;font-size:17px;font-weight:900;height:30px;justify-content:center;line-height:1;width:30px}
        .start-icon span,.entrance-icon span,.custom-start-icon span{border:2px solid #fff;border-radius:999px;box-shadow:0 8px 18px rgba(0,0,0,.24);color:#fff;display:inline-block;font-size:11px;font-weight:900;padding:5px 8px;white-space:nowrap}
        .start-icon span{background:#111827}.entrance-icon span{background:#0f766e}.custom-start-icon span{background:#2563eb}
        .network-notice{background:rgba(255,255,255,.98);border:2px solid #111827;border-radius:8px;box-shadow:0 12px 28px rgba(20,36,29,.18);font-size:13px;font-weight:900;left:18px;padding:10px 12px;position:absolute;top:66px;z-index:700}
        .legend{align-items:flex-start;flex-direction:column}.legend-swatch{border:2px solid;display:inline-block;height:10px;width:18px}.legend-swatch.core{background:rgba(245,158,11,.22);border-color:#f59e0b}.legend-swatch.range{background:rgba(37,99,235,.08);border-color:#2563eb}.route-line{border-radius:999px;display:inline-block;height:4px;width:22px}.route-line.fast{background:#dc2626}.route-line.newcomer{background:#2563eb}.route-line.wide{background:#0891b2}.route-line.coexist{background:#7c3aed}
      </style>
    `
    );
  }
}

injectResearchUi();

const dom = {
  summaryText: document.querySelector("#summaryText"),
  storeCount: document.querySelector("#storeCount"),
  directCount: document.querySelector("#directCount"),
  categoryCount: document.querySelector("#categoryCount"),
  searchInput: document.querySelector("#searchInput"),
  categorySelect: document.querySelector("#categorySelect"),
  shoppingCategorySelect: document.querySelector("#shoppingCategorySelect"),
  zoneSelect: document.querySelector("#zoneSelect"),
  directOnly: document.querySelector("#directOnly"),
  showLabels: document.querySelector("#showLabels"),
  duplicateMode: document.querySelector("#duplicateMode"),
  showCoreArea: document.querySelector("#showCoreArea"),
  showDistanceRings: document.querySelector("#showDistanceRings"),
  categoryBars: document.querySelector("#categoryBars"),
  shoppingBars: document.querySelector("#shoppingBars"),
  analysisMetrics: document.querySelector("#analysisMetrics"),
  duplicateSummary: document.querySelector("#duplicateSummary"),
  storeList: document.querySelector("#storeList"),
  visibleCount: document.querySelector("#visibleCount"),
  detailCard: document.querySelector("#detailCard"),
  fitButton: document.querySelector("#fitButton"),
  heatButton: document.querySelector("#heatButton"),
  startMode: document.querySelector("#startMode"),
  startDescription: document.querySelector("#startDescription"),
  shoppingChecklist: document.querySelector("#shoppingChecklist"),
  includeOuter: document.querySelector("#includeOuter"),
  diversityMode: document.querySelector("#diversityMode"),
  routeButtons: document.querySelector("#routeButtons"),
  candidateResults: document.querySelector("#candidateResults"),
  routeResults: document.querySelector("#routeResults"),
  routeComparison: document.querySelector("#routeComparison"),
  entranceComparison: document.querySelector("#entranceComparison"),
  routeDiagnostics: document.querySelector("#routeDiagnostics"),
  scoreDebug: document.querySelector("#scoreDebug"),
  scenarioSummary: document.querySelector("#scenarioSummary"),
};

const hasLeaflet = typeof L !== "undefined";
const map = hasLeaflet ? L.map("map", { zoomControl: false, preferCanvas: true }) : null;
let markerLayer = null;
let rangeLayer = null;
let coreLayer = null;
let entranceLayer = null;
let selectionLayer = null;
let routeLayer = null;

if (map) {
  map.setView([36.3289080464928, 127.43258232973459], 17);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  const osmTiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const cartoTiles = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 20,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }
  );
  let tileErrorCount = 0;
  osmTiles.on("tileerror", () => {
    tileErrorCount += 1;
    if (tileErrorCount === 4 && map.hasLayer(osmTiles)) {
      map.removeLayer(osmTiles);
      cartoTiles.addTo(map);
    }
  });
  osmTiles.addTo(map);
  rangeLayer = L.layerGroup().addTo(map);
  coreLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  entranceLayer = L.layerGroup().addTo(map);
  selectionLayer = L.layerGroup().addTo(map);
  if (!map.getPane("areaPane")) {
    map.createPane("areaPane");
    map.getPane("areaPane").style.zIndex = 410;
  }
  if (!map.getPane("routePane")) {
    map.createPane("routePane");
    map.getPane("routePane").style.zIndex = 690;
  }
  routeLayer = L.layerGroup().addTo(map);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value || 0);
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function distanceZone(distanceM) {
  if (distanceM <= 100) return "중심부";
  if (distanceM <= 200) return "중간부";
  return "외곽부";
}

function featurePoint(feature) {
  const [lon, lat] = feature.geometry.coordinates;
  return { lat, lon };
}

function routeDisplayPoint(feature, index, route) {
  const base = featurePoint(feature);
  const duplicateCount = route.filter(
    (item) => item.geometry.coordinates.join(",") === feature.geometry.coordinates.join(",")
  ).length;
  const closeToPrevious = index > 0 && haversineM(featurePoint(route[index - 1]), base) < 18;
  if (duplicateCount <= 1 && !closeToPrevious) return base;
  const angle = ((index * 137.5) % 360) * Math.PI / 180;
  const radiusM = 18 + (index % 4) * 7;
  const latOffset = (Math.cos(angle) * radiusM) / 111320;
  const lonOffset = (Math.sin(angle) * radiusM) / (111320 * Math.cos(base.lat * Math.PI / 180));
  return { lat: base.lat + latOffset, lon: base.lon + lonOffset, visualOffset: true };
}

function routeDisplayPoints(route, startPoint) {
  return [startPoint, ...route.map((feature, index) => routeDisplayPoint(feature, index, route))];
}

function haversineM(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const deltaPhi = toRad(b.lat - a.lat);
  const deltaLambda = toRad(b.lon - a.lon);
  const h =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDeg(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function classifyShoppingCategory(props) {
  const text = [
    props.name,
    props.category,
    props.middleCategory,
    props.smallCategory,
    props.building,
    props.roadAddress,
  ].join(" ");
  const rules = [
    ["과일·채소", ["과일", "청과", "채소", "야채", "농산", "과채"]],
    ["정육", ["정육", "축산", "고기", "육류", "한우", "돼지", "닭고기"]],
    ["수산·건어물", ["수산", "생선", "건어물", "어물", "해산", "회", "젓갈"]],
    ["반찬·식료품", ["반찬", "식료품", "식품", "슈퍼", "마트", "쌀", "곡물", "김치", "식자재"]],
    ["떡·한과", ["떡", "한과", "방앗간"]],
    [
      "분식·먹거리",
      ["분식", "김밥", "만두", "국수", "칼국수", "튀김", "순대", "빵", "제과", "치킨", "피자", "탕", "찌개", "백반", "한정식"],
    ],
    ["카페·음료", ["카페", "커피", "다방", "음료", "차", "비알코올"]],
    [
      "의류·잡화",
      ["의류", "의복", "신발", "한복", "가방", "잡화", "액세서리", "귀금속", "시계", "침구", "커튼", "섬유", "원단", "수선"],
    ],
    ["생활용품", ["생활용품", "주방", "가정용품", "철물", "공구", "가전", "통신", "핸드폰", "문구", "담배", "중고", "가구"]],
    ["보건·약국", ["약국", "의약", "의료", "보청기", "한의원", "의원", "화장품", "건강"]],
  ];
  const found = rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  if (found) return found[0];
  if (props.category === "소매") return "기타 소매";
  if (props.category === "음식") return "기타 음식";
  return "비장보기 업종";
}

function ensureEnriched(features) {
  const coordCounts = new Map();
  features.forEach((feature) => {
    const key = feature.geometry.coordinates.join(",");
    coordCounts.set(key, (coordCounts.get(key) || 0) + 1);
  });
  features.forEach((feature) => {
    const props = feature.properties;
    props.shopping_category ||= classifyShoppingCategory(props);
    props.distance_zone ||= distanceZone(props.distanceM);
    props.is_core_market_store ??= Boolean(props.directMarketMatch) || props.distance_zone === "중심부";
    props.is_outer_area ??= props.distance_zone === "외곽부";
    props.coordinate_duplicate_count ||= coordCounts.get(feature.geometry.coordinates.join(",")) || 1;
  });
}

function countBy(field) {
  return state.features.reduce((acc, feature) => {
    const value = feature.properties[field] || "미분류";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function centroid(points) {
  const total = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }),
    { lat: 0, lon: 0 }
  );
  return { lat: total.lat / points.length, lon: total.lon / points.length };
}

function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${point.lon},${point.lat}`, point])).values()];
  if (unique.length <= 3) return unique;
  const sorted = unique.sort((a, b) => a.lon - b.lon || a.lat - b.lat);
  const cross = (origin, a, b) =>
    (a.lon - origin.lon) * (b.lat - origin.lat) - (a.lat - origin.lat) * (b.lon - origin.lon);
  const lower = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  });
  const upper = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function directFeatures() {
  return state.features.filter((feature) => feature.properties.directMarketMatch);
}

function computeEntrances() {
  const points = directFeatures().map(featurePoint);
  const center = centroid(points);
  const west = points.reduce((best, point) => (point.lon < best.lon ? point : best), points[0]);
  const east = points.reduce((best, point) => (point.lon > best.lon ? point : best), points[0]);
  const north = points.reduce((best, point) => (point.lat > best.lat ? point : best), points[0]);
  const south = points.reduce((best, point) => (point.lat < best.lat ? point : best), points[0]);
  state.entrances = [
    { id: "entrance-a", label: "주요 입구 A", point: west, description: "서측 주요 진입 후보 지점" },
    { id: "entrance-b", label: "주요 입구 B", point: north, description: "북측 주요 진입 후보 지점" },
    { id: "entrance-c", label: "주요 입구 C", point: east, description: "동측 주요 진입 후보 지점" },
    { id: "entrance-d", label: "주요 입구 D", point: south, description: "남측 주요 진입 후보 지점" },
  ];
  return center;
}

function renderStartOptions() {
  dom.startMode.innerHTML = `
    <option value="center">시장 중심점</option>
    <option value="direct-centroid">직접 매칭 점포 중심점</option>
    <option value="custom">지도에서 임의 위치 클릭</option>
    ${state.entrances
      .map((entrance) => `<option value="${entrance.id}">${entrance.label} - ${entrance.description}</option>`)
      .join("")}
  `;
}

function currentStartPoint() {
  const center = state.metadata.filter.center;
  if (dom.startMode.value === "direct-centroid") {
    const directCenter = centroid(directFeatures().map(featurePoint));
    return { ...directCenter, label: "직접 매칭 점포 중심점" };
  }
  if (dom.startMode.value === "custom" && state.customStart) return state.customStart;
  const entrance = state.entrances.find((item) => item.id === dom.startMode.value);
  if (entrance) return { ...entrance.point, label: `${entrance.label}(${entrance.description})` };
  return { lat: center.lat, lon: center.lon, label: "시장 중심점" };
}

function updateStartDescription() {
  const start = currentStartPoint();
  const customNote =
    dom.startMode.value === "custom" && !state.customStart
      ? "지도에서 시작 위치를 클릭하면 해당 위치를 출발지로 사용합니다."
      : "";
  dom.startDescription.textContent = `현재 출발지: ${start.label}. 주요 입구 A~D는 공식 출입구가 아니라 직접 매칭 점포 분포를 기준으로 잡은 주요 진입 후보 지점입니다. ${customNote}`;
}

function markerStyle(props) {
  if (state.heatMode) {
    return {
      radius: props.directMarketMatch ? 26 : 18,
      color: "transparent",
      fillColor: props.directMarketMatch ? colors.direct : colors.area,
      fillOpacity: props.directMarketMatch ? 0.18 : 0.1,
      className: "heat-marker",
    };
  }
  const highlighted = state.highlightedIds.has(props.id);
  return {
    radius: highlighted ? 14 : props.directMarketMatch ? 11 : 8,
    color: highlighted ? "#111827" : "#ffffff",
    weight: highlighted ? 4 : props.directMarketMatch ? 3 : 2,
    fillColor: props.directMarketMatch ? colors.direct : props.is_outer_area ? colors.outer : colors.area,
    fillOpacity: highlighted ? 1 : props.directMarketMatch ? 0.95 : 0.86,
  };
}

function popupHtml(props) {
  const address = props.roadAddress || props.lotAddress || "주소 정보 없음";
  return `
    <div class="popup-title">${escapeHtml(props.name)}</div>
    <div class="popup-meta">
      ${escapeHtml(props.shopping_category)} · ${escapeHtml(props.smallCategory)}<br />
      ${escapeHtml(address)}<br />
      중심점에서 ${formatNumber(props.distanceM)}m · ${escapeHtml(props.distance_zone)}<br />
      동일 좌표 ${formatNumber(props.coordinate_duplicate_count)}개 점포
    </div>
  `;
}

function featureMatches(feature) {
  const props = feature.properties;
  const keyword = normalize(dom.searchInput.value);
  if (dom.directOnly.checked && !props.directMarketMatch) return false;
  if (dom.categorySelect.value && props.category !== dom.categorySelect.value) return false;
  if (dom.shoppingCategorySelect.value && props.shopping_category !== dom.shoppingCategorySelect.value) return false;
  if (dom.zoneSelect.value && props.distance_zone !== dom.zoneSelect.value) return false;
  if (!keyword) return true;
  return normalize(
    [
      props.name,
      props.branch,
      props.category,
      props.middleCategory,
      props.smallCategory,
      props.shopping_category,
      props.roadAddress,
      props.lotAddress,
      props.building,
    ].join(" ")
  ).includes(keyword);
}

function renderDuplicateMarkers(features) {
  const grouped = new Map();
  features.forEach((feature) => {
    const key = feature.geometry.coordinates.join(",");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(feature);
  });
  grouped.forEach((group) => {
    const first = group[0];
    const [lon, lat] = first.geometry.coordinates;
    const duplicateCount = first.properties.coordinate_duplicate_count || group.length;
    const marker = L.circleMarker([lat, lon], {
      radius: Math.min(34, 8 + duplicateCount * 0.35),
      color: "#7c2d12",
      weight: 2,
      fillColor: duplicateCount >= 20 ? "#dc2626" : "#f59e0b",
      fillOpacity: 0.58,
    });
    const names = group
      .slice(0, 8)
      .map((feature) => escapeHtml(feature.properties.name))
      .join(", ");
    marker.bindPopup(`
      <div class="popup-title">좌표 중복 지점</div>
      <div class="popup-meta">
        동일 좌표 점포 ${formatNumber(duplicateCount)}개<br />
        ${escapeHtml(first.properties.roadAddress || "주소 정보 없음")}<br />
        예시: ${names}${group.length > 8 ? "..." : ""}
      </div>
    `);
    marker.addTo(markerLayer);
  });
}

function renderMarkers() {
  const visible = state.features.filter(featureMatches);
  if (markerLayer) {
    markerLayer.clearLayers();
    state.markers.clear();
    if (state.duplicateMode) {
      renderDuplicateMarkers(visible);
    } else {
      visible.forEach((feature) => {
        const [lon, lat] = feature.geometry.coordinates;
        const marker = L.circleMarker([lat, lon], markerStyle(feature.properties));
        marker.bindPopup(popupHtml(feature.properties));
        marker.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          selectFeature(feature, true);
        });
        marker.addTo(markerLayer);
        state.markers.set(feature.properties.id, marker);
      });
    }
  }
  dom.visibleCount.textContent = `${formatNumber(visible.length)}건`;
  renderList(visible);
}

function renderList(features) {
  const rows = features.slice(0, 300).map((feature) => {
    const props = feature.properties;
    const badge = props.directMarketMatch ? "직접" : "권역";
    const badgeClass = props.directMarketMatch ? "direct" : "area";
    const address = props.roadAddress || props.lotAddress || "";
    return `
      <button class="store-item ${state.selectedId === props.id ? "active" : ""}" data-id="${escapeHtml(props.id)}">
        <div class="store-title">
          <strong>${escapeHtml(props.name)}</strong>
          <span class="pill ${badgeClass}">${badge}</span>
        </div>
        <div class="store-meta">
          ${escapeHtml(props.shopping_category)} · ${escapeHtml(props.smallCategory)} · ${formatNumber(props.distanceM)}m · ${escapeHtml(props.distance_zone)}<br />
          ${escapeHtml(address)}
        </div>
      </button>
    `;
  });
  dom.storeList.innerHTML =
    rows.join("") +
    (features.length > 300 ? `<p class="list-note">목록은 성능을 위해 상위 300개만 표시합니다.</p>` : "");
}

function barRow(label, count, max) {
  const width = Math.max(5, Math.round((count / max) * 100));
  return `
    <div class="bar-row">
      <div class="bar-top"><span>${escapeHtml(label)}</span><strong>${formatNumber(count)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
    </div>
  `;
}

function renderStats() {
  const counts = state.metadata.counts;
  const categories = Object.entries(counts.categories);
  const max = Math.max(...categories.map(([, count]) => count));
  const shoppingCounts = state.shoppingSummary?.shoppingCategoryCounts || countBy("shopping_category");
  const shoppingMax = Math.max(...Object.values(shoppingCounts));

  dom.storeCount.textContent = formatNumber(counts.stores);
  dom.directCount.textContent = formatNumber(counts.directMarketMatches);
  dom.categoryCount.textContent = formatNumber(categories.length);
  dom.summaryText.textContent = `중앙시장 직접 매칭 점포 중심에서 ${formatNumber(
    state.metadata.filter.radiusM
  )}m 안의 점포를 분석합니다. 직접 매칭 점포는 중앙시장 관련 명칭과 연결된 점포이고, 주변 권역 점포는 300m 내 중앙동 상권 점포입니다.`;

  dom.categorySelect.innerHTML =
    '<option value="">전체 업종</option>' +
    categories.map(([category]) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  dom.shoppingCategorySelect.innerHTML =
    '<option value="">전체 품목군</option>' +
    SHOPPING_CATEGORIES.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  dom.categoryBars.innerHTML = categories
    .slice(0, 5)
    .map(([category, count]) => barRow(category, count, max))
    .join("");
  dom.shoppingBars.innerHTML = Object.entries(shoppingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => barRow(category, count, shoppingMax))
    .join("");

  renderAnalysisMetrics();
  renderShoppingChecklist();
  renderRouteButtons();
  renderScenarioSummary();
}

function renderAnalysisMetrics() {
  const shoppingRelated = state.features.filter(
    (feature) => feature.properties.shopping_category !== "비장보기 업종"
  ).length;
  const zoneCounts = countBy("distance_zone");
  const duplicateTop = [...state.features].sort(
    (a, b) => b.properties.coordinate_duplicate_count - a.properties.coordinate_duplicate_count
  )[0];
  dom.analysisMetrics.innerHTML = `
    <div><strong>${formatNumber(state.features.length)}</strong><span>전체 점포</span></div>
    <div><strong>${formatNumber(shoppingRelated)}</strong><span>장보기 관련</span></div>
    <div><strong>${formatNumber(state.metadata.counts.categories["소매"] || 0)}</strong><span>소매 점포</span></div>
    <div><strong>${formatNumber(state.metadata.counts.categories["음식"] || 0)}</strong><span>음식 점포</span></div>
    <div><strong>${formatNumber(zoneCounts["중심부"] || 0)}</strong><span>중심부</span></div>
    <div><strong>${formatNumber(zoneCounts["외곽부"] || 0)}</strong><span>외곽부</span></div>
  `;
  dom.duplicateSummary.textContent = duplicateTop
    ? `좌표 중복 최상위 지점은 ${duplicateTop.properties.roadAddress || "주소 정보 없음"}이며 동일 좌표에 ${formatNumber(
        duplicateTop.properties.coordinate_duplicate_count
      )}개 점포가 겹칩니다.`
    : "좌표 중복 정보를 확인할 수 없습니다.";
}

function renderAreaLayers() {
  if (!map) return;
  rangeLayer.clearLayers();
  coreLayer.clearLayers();
  const center = state.metadata.filter.center;
  const allBounds = L.latLngBounds(
    state.features.map((feature) => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]])
  ).pad(0.08);

  L.rectangle(allBounds, {
    pane: "areaPane",
    color: colors.analysisRange,
    weight: 4,
    opacity: 0.95,
    fillColor: colors.analysisRange,
    fillOpacity: 0.035,
    dashArray: "12 8",
  })
    .bindTooltip("주변 상권 분석 범위(점포 데이터 전체 범위, 300m 권역 보조 표시)", { sticky: true })
    .addTo(rangeLayer);

  if (dom.showDistanceRings.checked) {
    [
      [300, colors.analysisRange, "주변 상권 분석 범위 300m", 5, 0.12],
      [200, "#0f766e", "중간부 경계 200m", 3, 0.07],
      [100, colors.direct, "중심부 경계 100m", 3, 0.08],
    ].forEach(([radius, color, label, weight, fillOpacity]) => {
      L.circle([center.lat, center.lon], {
        pane: "areaPane",
        radius,
        color,
        weight,
        opacity: 0.95,
        fillColor: color,
        fillOpacity,
      })
        .bindTooltip(label, { sticky: true })
        .addTo(rangeLayer);
    });
  } else {
    L.circle([center.lat, center.lon], {
      pane: "areaPane",
      radius: state.metadata.filter.radiusM,
      color: colors.analysisRange,
      weight: 5,
      opacity: 0.95,
      fillColor: colors.analysisRange,
      fillOpacity: 0.1,
    })
      .bindTooltip("주변 상권 분석 범위 300m", { sticky: true })
      .addTo(rangeLayer);
  }

  L.marker([allBounds.getNorth(), allBounds.getWest()], {
    pane: "routePane",
    interactive: false,
    icon: L.divIcon({
      className: "area-label-icon",
      html: "<span>주변 상권 분석 범위 300m</span>",
      iconSize: [170, 28],
      iconAnchor: [0, 14],
    }),
  }).addTo(rangeLayer);

  if (dom.showCoreArea.checked) {
    const hull = convexHull(directFeatures().map(featurePoint));
    if (hull.length >= 3) {
      const coreBounds = L.latLngBounds(hull.map((point) => [point.lat, point.lon]));
      L.polygon(
        hull.map((point) => [point.lat, point.lon]),
        {
          pane: "areaPane",
          color: colors.marketCore,
          fillColor: colors.marketCore,
          fillOpacity: 0.36,
          weight: 5,
          opacity: 1,
          dashArray: "10 6",
        }
      )
        .bindTooltip("중앙시장 핵심 구역(직접 매칭 점포 기반 추정, 공식 경계 아님)", { sticky: true })
        .addTo(coreLayer);
      L.rectangle(coreBounds.pad(0.02), {
        pane: "areaPane",
        color: "#92400e",
        weight: 2,
        opacity: 0.85,
        fillOpacity: 0,
      }).addTo(coreLayer);
      L.marker(coreBounds.getCenter(), {
        pane: "routePane",
        interactive: false,
        icon: L.divIcon({
          className: "area-label-icon",
          html: "<span>중앙시장 핵심 구역(추정)</span>",
          iconSize: [190, 28],
          iconAnchor: [95, 14],
        }),
      }).addTo(coreLayer);
    }
  }
}
function renderEntranceMarkers() {
  if (!entranceLayer) return;
  entranceLayer.clearLayers();
  state.entrances.forEach((entrance) => {
    const icon = L.divIcon({
      className: "entrance-icon",
      html: `<span>${entrance.label.replace("주요 ", "")}</span>`,
      iconSize: [72, 28],
      iconAnchor: [36, 14],
    });
    const marker = L.marker([entrance.point.lat, entrance.point.lon], { icon })
      .bindPopup(`<strong>${escapeHtml(entrance.label)}</strong><br />${escapeHtml(entrance.description)}<br />공식 출입구가 아닌 주요 진입 후보 지점입니다.`)
      .addTo(entranceLayer);
    marker.on("click", () => {
      dom.startMode.value = entrance.id;
      updateStartDescription();
      renderRecommendations();
    });
  });
}

function selectFeature(feature, panToMarker) {
  state.selectedId = feature.properties.id;
  const props = feature.properties;
  const marker = state.markers.get(props.id);
  const [lon, lat] = feature.geometry.coordinates;
  if (selectionLayer) {
    selectionLayer.clearLayers();
    const selectedIcon = L.divIcon({
      className: "start-icon",
      html: "<span>선택</span>",
      iconSize: [52, 28],
      iconAnchor: [26, 14],
    });
    L.marker([lat, lon], { icon: selectedIcon }).addTo(selectionLayer);
  }
  if (panToMarker && marker && map) {
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 18), { animate: true, duration: 0.75 });
    marker.openPopup();
  }
  const address = props.roadAddress || props.lotAddress || "주소 정보 없음";
  dom.detailCard.hidden = false;
  dom.detailCard.innerHTML = `
    <h3>${escapeHtml(props.name)}</h3>
    <span class="pill ${props.directMarketMatch ? "direct" : "area"}">${
      props.directMarketMatch ? "시장명 직접 매칭" : "중앙시장권역"
    }</span>
    <dl>
      <dt>품목군</dt><dd>${escapeHtml(props.shopping_category)}</dd>
      <dt>업종</dt><dd>${escapeHtml(props.category)} · ${escapeHtml(props.smallCategory)}</dd>
      <dt>주소</dt><dd>${escapeHtml(address)}</dd>
      <dt>거리구간</dt><dd>${escapeHtml(props.distance_zone)} · 중심점에서 ${formatNumber(props.distanceM)}m</dd>
      <dt>좌표중복</dt><dd>동일 좌표 ${formatNumber(props.coordinate_duplicate_count)}개 점포</dd>
    </dl>
  `;
  if (dom.showLabels.checked) renderList(state.features.filter(featureMatches));
}

function fitToData() {
  if (!map || !state.features.length) return;
  map.invalidateSize();
  const bounds = L.latLngBounds(
    state.features.map((feature) => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]])
  );
  map.fitBounds(bounds.pad(0.08));
}

function renderShoppingChecklist() {
  const selectable = SHOPPING_CATEGORIES.filter(
    (category) => !["기타 소매", "기타 음식", "비장보기 업종", "의류·잡화"].includes(category)
  );
  dom.shoppingChecklist.innerHTML = selectable
    .map(
      (category) => `
        <label>
          <input type="checkbox" value="${escapeHtml(category)}" ${
        ["과일·채소", "반찬·식료품", "분식·먹거리"].includes(category) ? "checked" : ""
      } />
          ${escapeHtml(category)}
        </label>
      `
    )
    .join("");
}

function renderRouteButtons() {
  dom.routeButtons.innerHTML = ROUTE_TYPES.map(
    (type) =>
      `<button type="button" class="${state.routeType === type ? "active" : ""}" data-route-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`
  ).join("");
}

function selectedShoppingCategories() {
  return [...dom.shoppingChecklist.querySelectorAll("input:checked")].map((input) => input.value);
}

function candidatePool(category, options = {}) {
  const includeOuter = options.includeOuter ?? dom.includeOuter.checked;
  return state.features
    .filter((feature) => feature.properties.shopping_category === category)
    .filter((feature) => includeOuter || feature.properties.distance_zone !== "외곽부")
    .sort((a, b) => {
      const ap = a.properties;
      const bp = b.properties;
      return (
        ap.distanceM - bp.distanceM ||
        Number(!ap.directMarketMatch) - Number(!bp.directMarketMatch) ||
        ap.coordinate_duplicate_count - bp.coordinate_duplicate_count ||
        ap.name.localeCompare(bp.name, "ko")
      );
    })
    .slice(0, includeOuter ? 55 : 35);
}

function scoreBreakdown(routeType, current, feature, selectedFeatures = []) {
  const props = feature.properties;
  const distanceScore = haversineM(current, featurePoint(feature));
  let centerBonus = 0;
  let directBonus = 0;
  let outerBonus = 0;
  let duplicatePenalty = 0;
  let diversityPenalty = 0;

  if (routeType === "초행자 친화형") {
    centerBonus = props.distance_zone === "중심부" ? -55 : props.distance_zone === "중간부" ? -18 : 45;
    directBonus = props.directMarketMatch ? -85 : 0;
    duplicatePenalty = Math.min(props.coordinate_duplicate_count, 25) * 1.8;
  } else if (routeType === "상생형") {
    outerBonus = props.distance_zone === "외곽부" ? -135 : props.distance_zone === "중간부" ? -35 : 18;
    directBonus = props.directMarketMatch ? -8 : 0;
    duplicatePenalty = Math.min(props.coordinate_duplicate_count, 30) * 2.2;
  }

  if (dom.diversityMode.checked && routeType !== "빠른 장보기") {
    const sameCoordinate = selectedFeatures.some(
      (selected) => selected.geometry.coordinates.join(",") === feature.geometry.coordinates.join(",")
    );
    if (sameCoordinate) diversityPenalty += 120;
    const sameRoad = selectedFeatures.some(
      (selected) => selected.properties.roadAddress && selected.properties.roadAddress === props.roadAddress
    );
    if (sameRoad) diversityPenalty += 35;
  }

  const total = distanceScore + centerBonus + directBonus + outerBonus + duplicatePenalty + diversityPenalty;
  return { distanceScore, centerBonus, directBonus, outerBonus, duplicatePenalty, diversityPenalty, total };
}

function routeDistance(route, startPoint = currentStartPoint()) {
  let total = 0;
  let current = startPoint;
  route.forEach((feature) => {
    const point = featurePoint(feature);
    total += haversineM(current, point);
    current = point;
  });
  return Math.round(total);
}

function buildRoute(categories, routeType, startPoint = currentStartPoint(), options = {}) {
  const remaining = [...categories];
  const route = [];
  const debug = [];
  let current = startPoint;

  while (remaining.length) {
    const scored = [];
    remaining.forEach((category) => {
      candidatePool(category, options).forEach((feature) => {
        const breakdown = scoreBreakdown(routeType, current, feature, route);
        scored.push({ category, feature, breakdown });
      });
    });
    if (!scored.length) break;
    scored.sort((a, b) => a.breakdown.total - b.breakdown.total);
    const chosen = scored[0];
    route.push(chosen.feature);
    debug.push({ category: chosen.category, feature: chosen.feature, breakdown: chosen.breakdown });
    remaining.splice(remaining.indexOf(chosen.category), 1);
    current = featurePoint(chosen.feature);
  }

  return { route, debug };
}

function enforceOuterForCoexist(categories, baseResult, fastDistance, startPoint) {
  if (!dom.includeOuter.checked || !dom.diversityMode.checked) return { ...baseResult, adjusted: false };
  if (baseResult.route.some((feature) => feature.properties.distance_zone === "외곽부")) {
    return { ...baseResult, adjusted: false };
  }
  const maxDistance = Math.round(fastDistance * 1.15);
  let best = null;
  baseResult.debug.forEach((debugItem, index) => {
    const category = debugItem.category;
    candidatePool(category, { includeOuter: true })
      .filter((feature) => feature.properties.distance_zone === "외곽부")
      .slice(0, 18)
      .forEach((candidate) => {
        const trial = [...baseResult.route];
        trial[index] = candidate;
        const trialDistance = routeDistance(trial, startPoint);
        if (trialDistance <= maxDistance && (!best || trialDistance < best.distance)) {
          best = { route: trial, distance: trialDistance, replacedIndex: index, candidate };
        }
      });
  });
  if (!best) return { ...baseResult, adjusted: false, outerLimitBlocked: true };
  const debug = baseResult.debug.map((item, index) => {
    if (index !== best.replacedIndex) return item;
    return {
      category: item.category,
      feature: best.candidate,
      breakdown: scoreBreakdown("상생형", index === 0 ? startPoint : featurePoint(best.route[index - 1]), best.candidate, best.route.slice(0, index)),
    };
  });
  return { route: best.route, debug, adjusted: true, outerLimitBlocked: false };
}

function routeMetrics(route, fastDistance, startPoint = currentStartPoint()) {
  const distance = routeDistance(route, startPoint);
  const props = route.map((feature) => feature.properties);
  return {
    count: route.length,
    distance,
    minutes: Math.round((distance / WALKING_M_PER_MIN) * 10) / 10,
    core: props.filter((prop) => prop.distance_zone === "중심부").length,
    outer: props.filter((prop) => prop.distance_zone === "외곽부").length,
    direct: props.filter((prop) => prop.directMarketMatch).length,
    increase: fastDistance ? Math.round(((distance - fastDistance) / fastDistance) * 1000) / 10 : 0,
  };
}

function computeAllRoutes(categories, startPoint = currentStartPoint()) {
  const fast = buildRoute(categories, "빠른 장보기", startPoint, { includeOuter: dom.includeOuter.checked });
  const fastDistance = routeDistance(fast.route, startPoint);
  const newcomer = buildRoute(categories, "초행자 친화형", startPoint, { includeOuter: dom.includeOuter.checked });
  const wide = buildRoute(categories, "넓은 길 우선형", startPoint, { includeOuter: dom.includeOuter.checked });
  const coexistBase = buildRoute(categories, "상생형", startPoint, { includeOuter: dom.includeOuter.checked });
  const coexist = enforceOuterForCoexist(categories, coexistBase, fastDistance, startPoint);
  return {
    "빠른 장보기": {
      ...fast,
      metrics: routeMetrics(fast.route, fastDistance, startPoint),
      startPoint,
    },
    "초행자 친화형": {
      ...newcomer,
      metrics: routeMetrics(newcomer.route, fastDistance, startPoint),
      startPoint,
    },
    "넓은 길 우선형": {
      ...wide,
      metrics: routeMetrics(wide.route, fastDistance, startPoint),
      startPoint,
    },
    "상생형": {
      ...coexist,
      metrics: routeMetrics(coexist.route, fastDistance, startPoint),
      startPoint,
    },
  };
}

function sameCombination(a, b) {
  const left = a.map((feature) => feature.properties.id).sort().join("|");
  const right = b.map((feature) => feature.properties.id).sort().join("|");
  return left === right;
}

function sameOrder(a, b) {
  return a.map((feature) => feature.properties.id).join("|") === b.map((feature) => feature.properties.id).join("|");
}

function diagnoseRoutes(results) {
  const fast = results["빠른 장보기"].route;
  const newcomer = results["초행자 친화형"].route;
  const coexist = results["상생형"].route;
  const messages = [];
  const allSameCombination = sameCombination(fast, newcomer) && sameCombination(fast, coexist);
  const allSameOrder = sameOrder(fast, newcomer) && sameOrder(fast, coexist);
  if (allSameOrder) {
    messages.push("세 경로 유형이 동일한 방문 순서를 선택했습니다. 현재 장보기 품목군의 후보 점포가 중심부에 밀집되어 있거나, 출발지에서 가까운 후보가 매우 강하게 우세한 경우입니다.");
  } else if (allSameCombination) {
    messages.push("세 경로 유형이 같은 점포 조합을 선택했지만 방문 순서는 일부 다릅니다. 후보 점포는 같고 출발지와 거리 계산에 따라 순서만 달라진 상황입니다.");
  } else {
    messages.push("경로 유형별 점포 조합이 달라졌습니다. 빠른 장보기는 거리, 초행자형은 중심부·직접 매칭, 상생형은 외곽부 노출을 더 반영했습니다.");
  }
  const categories = selectedShoppingCategories();
  const compactCategories = categories.filter((category) => candidatePool(category).slice(0, 6).every((feature) => feature.properties.distance_zone !== "외곽부"));
  if (compactCategories.length) {
    messages.push(`${compactCategories.join(", ")} 품목군은 상위 후보가 중심부·중간부에 몰려 있어 경로 다양성이 제한될 수 있습니다.`);
  }
  const start = currentStartPoint();
  const directCenter = centroid(directFeatures().map(featurePoint));
  if (haversineM(start, directCenter) < 80) {
    messages.push("현재 출발지가 직접 매칭 점포 중심과 가까워 입구를 바꾸지 않으면 방문 순서가 비슷하게 유지될 수 있습니다.");
  }
  if (results["상생형"].outerLimitBlocked) {
    messages.push("상생형은 외곽부 점포를 포함하려 했지만 빠른 장보기 대비 15% 이내 거리 증가 제한을 만족하는 대체 후보를 찾지 못했습니다.");
  }
  if (!dom.diversityMode.checked) {
    messages.push("경로 다양성 높이기 옵션이 꺼져 있어 동일 좌표·동일 주소 후보에 대한 보정이 적용되지 않았습니다.");
  }
  return { allSameCombination, allSameOrder, messages };
}

function renderRecommendations() {
  const categories = selectedShoppingCategories();
  state.highlightedIds = new Set();
  if (!categories.length) {
    dom.candidateResults.innerHTML = '<p class="empty-note">장보기 품목군을 선택하세요.</p>';
    dom.routeResults.innerHTML = "";
    dom.routeComparison.innerHTML = "";
    dom.entranceComparison.innerHTML = "";
    dom.routeDiagnostics.innerHTML = "";
    dom.scoreDebug.innerHTML = "";
    if (routeLayer) routeLayer.clearLayers();
    renderMarkers();
    return;
  }

  updateStartDescription();
  state.routeResults = computeAllRoutes(categories);
  const activeResult = state.routeResults[state.routeType];
  activeResult.route.forEach((feature) => state.highlightedIds.add(feature.properties.id));
  Object.values(state.routeResults).forEach((result) => {
    result.route.forEach((feature) => state.highlightedIds.add(feature.properties.id));
  });

  renderCandidateResults(categories);
  renderActiveRoute(activeResult);
  renderRouteComparison();
  renderEntranceComparison(categories);
  renderDiagnostics();
  renderScoreDebug(activeResult);
  renderMarkers();
}

function renderCandidateResults(categories) {
  dom.candidateResults.innerHTML = categories
    .map((category) => {
      const chosenByType = ROUTE_TYPES.map((type) => {
        const item = state.routeResults[type].debug.find((debug) => debug.category === category);
        return item ? `${type}: ${item.feature.properties.name}` : `${type}: 후보 없음`;
      }).join("<br />");
      const candidates = candidatePool(category).slice(0, 5);
      return `
        <div class="candidate-group">
          <h3>${escapeHtml(category)}</h3>
          <p class="research-note">${chosenByType}</p>
          ${candidates
            .map((feature) => {
              const props = feature.properties;
              return `
                <button type="button" class="candidate-card" data-id="${escapeHtml(props.id)}">
                  <strong>${escapeHtml(props.name)}</strong>
                  <span>${escapeHtml(props.smallCategory)} · ${formatNumber(props.distanceM)}m · ${escapeHtml(props.distance_zone)}</span>
                  <span>${props.directMarketMatch ? "시장명 직접 매칭" : "주변 권역"} · 동일 좌표 ${formatNumber(props.coordinate_duplicate_count)}개</span>
                </button>
              `;
            })
            .join("")}
        </div>
      `;
    })
    .join("");
}

function renderStartMarker(startPoint, routeColor) {
  if (!routeLayer) return;
  const startIcon = L.divIcon({
    className: "start-icon",
    html: `<span style="background:${routeColor}">출발</span>`,
    iconSize: [64, 32],
    iconAnchor: [32, 16],
  });
  L.marker([startPoint.lat, startPoint.lon], { icon: startIcon, pane: "routePane", zIndexOffset: 1200 })
    .bindPopup(`현재 출발지: ${escapeHtml(startPoint.label)}`)
    .addTo(routeLayer);
}

function renderDirectionArrows(points, routeColor) {
  if (!routeLayer) return;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const segmentLength = haversineM(a, b);
    const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    const angle = bearingDeg(a, b);
    const icon = L.divIcon({
      className: "route-arrow-icon",
      html: `<span style="background:${routeColor};transform:rotate(${angle}deg)">↑</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([mid.lat, mid.lon], { icon, interactive: false, pane: "routePane", zIndexOffset: 1100 }).addTo(routeLayer);
    if (segmentLength > 70) {
      const mid2 = { lat: a.lat * 0.34 + b.lat * 0.66, lon: a.lon * 0.34 + b.lon * 0.66 };
      L.marker([mid2.lat, mid2.lon], { icon, interactive: false, pane: "routePane", zIndexOffset: 1100 }).addTo(routeLayer);
    }
  }
}

function renderActiveRoute(result) {
  const config = ROUTE_CONFIG[state.routeType];
  const route = result.route;
  const metrics = result.metrics;
  const start = result.startPoint;
  if (routeLayer) {
    routeLayer.clearLayers();
    const points = routeDisplayPoints(route, start);
    const latLngs = points.map((point) => [point.lat, point.lon]);
    const halo = L.polyline(latLngs, {
      pane: "routePane",
      color: "#ffffff",
      weight: 18,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(routeLayer);
    const line = L.polyline(latLngs, {
      pane: "routePane",
      color: config.color,
      weight: 9,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(routeLayer);
    halo.bringToFront();
    line.bringToFront();
    renderDirectionArrows(points, config.color);
    renderStartMarker(start, config.color);
    route.forEach((feature, index) => {
      const displayPoint = points[index + 1];
      const icon = L.divIcon({
        className: "route-number-icon",
        html: `<span style="background:${config.color}">${index + 1}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      L.marker([displayPoint.lat, displayPoint.lon], { icon, pane: "routePane", zIndexOffset: 1300 })
        .bindPopup(popupHtml(feature.properties))
        .addTo(routeLayer);
      if (displayPoint.visualOffset) {
        L.polyline(
          [[displayPoint.lat, displayPoint.lon], [feature.geometry.coordinates[1], feature.geometry.coordinates[0]]],
          { pane: "routePane", color: config.color, weight: 2, opacity: 0.65, dashArray: "4 4" }
        ).addTo(routeLayer);
      }
    });
  }

  dom.routeResults.innerHTML = `
    <div class="route-summary">
      <h3>${escapeHtml(state.routeType)} 예비 경로</h3>
      <p>${escapeHtml(config.label)}. 점포 좌표 간 직선거리 연결선이며 실제 보행 경로가 아닙니다. 동일 주소에 겹친 점포는 지도에서 읽기 쉽도록 번호 마커 위치만 약간 분산 표시합니다.</p>
      <div class="route-metrics">
        <span>출발지: ${escapeHtml(start.label)}</span>
        <span>방문 ${formatNumber(metrics.count)}곳</span>
        <span>총 ${formatNumber(metrics.distance)}m</span>
        <span>약 ${metrics.minutes}분</span>
        <span>중심부 ${formatNumber(metrics.core)}곳</span>
        <span>외곽부 ${formatNumber(metrics.outer)}곳</span>
        <span>직접매칭 ${formatNumber(metrics.direct)}곳</span>
        <span>빠른 장보기 대비 ${metrics.increase}%</span>
      </div>
      <ol>
        ${route
          .map((feature) => {
            const props = feature.properties;
            return `<li>${escapeHtml(props.shopping_category)} - ${escapeHtml(props.name)} (${escapeHtml(props.distance_zone)}, ${formatNumber(props.distanceM)}m)</li>`;
          })
          .join("")}
      </ol>
    </div>
  `;
}
function renderRouteComparison() {
  const diagnostics = diagnoseRoutes(state.routeResults);
  dom.routeComparison.innerHTML = `
    <table>
      <thead><tr><th>경로 유형</th><th>총 거리</th><th>시간</th><th>중심부</th><th>외곽부</th><th>직접 매칭</th><th>동일 여부</th></tr></thead>
      <tbody>
        ${ROUTE_TYPES.map((type) => {
          const metrics = state.routeResults[type].metrics;
          return `
            <tr>
              <td>${escapeHtml(type)}</td>
              <td>${formatNumber(metrics.distance)}m</td>
              <td>${metrics.minutes}분</td>
              <td>${formatNumber(metrics.core)}</td>
              <td>${formatNumber(metrics.outer)}</td>
              <td>${formatNumber(metrics.direct)}</td>
              <td>${diagnostics.allSameOrder ? "동일 경로" : diagnostics.allSameCombination ? "같은 조합" : "차이 있음"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderEntranceComparison(categories) {
  const entrances = state.entrances.slice(0, 4);
  const rows = entrances.map((entrance) => {
    const results = computeAllRoutes(categories, { ...entrance.point, label: entrance.label });
    const active = results[state.routeType];
    return {
      label: entrance.label,
      description: entrance.description,
      metrics: active.metrics,
      route: active.route,
    };
  });
  dom.entranceComparison.innerHTML = `
    <table>
      <thead><tr><th>출발 후보</th><th>총 거리</th><th>외곽부</th><th>방문 순서</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>${escapeHtml(row.label)}<br />${escapeHtml(row.description)}</td>
            <td>${formatNumber(row.metrics.distance)}m</td>
            <td>${formatNumber(row.metrics.outer)}곳</td>
            <td>${row.route.map((feature) => escapeHtml(feature.properties.name)).join(" → ")}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderDiagnostics() {
  const diagnostics = diagnoseRoutes(state.routeResults);
  const selectedCategories = selectedShoppingCategories().join(", ");
  const selectedByType = ROUTE_TYPES.map((type) => {
    const route = state.routeResults[type].route
      .map((feature) => `${feature.properties.shopping_category}:${feature.properties.name}`)
      .join(" → ");
    return `${type}: ${route}`;
  });
  dom.routeDiagnostics.innerHTML = `
    <div class="diagnostic-item">선택 품목군: ${escapeHtml(selectedCategories)}</div>
    <div class="diagnostic-item">현재 출발지: ${escapeHtml(currentStartPoint().label)}</div>
    ${selectedByType.map((text) => `<div class="diagnostic-item">${escapeHtml(text)}</div>`).join("")}
    ${diagnostics.messages.map((message) => `<div class="diagnostic-item">${escapeHtml(message)}</div>`).join("")}
  `;
}

function renderScoreDebug(result) {
  dom.scoreDebug.innerHTML = `
    <table>
      <thead><tr><th>품목군</th><th>선택 점포</th><th>거리</th><th>중심부 보정</th><th>직접 매칭</th><th>외곽부 보정</th><th>중복/다양성</th><th>총점</th></tr></thead>
      <tbody>
        ${result.debug
          .map((item) => {
            const b = item.breakdown;
            return `
              <tr>
                <td>${escapeHtml(item.category)}</td>
                <td>${escapeHtml(item.feature.properties.name)}</td>
                <td>${Math.round(b.distanceScore)}</td>
                <td>${Math.round(b.centerBonus)}</td>
                <td>${Math.round(b.directBonus)}</td>
                <td>${Math.round(b.outerBonus)}</td>
                <td>${Math.round(b.duplicatePenalty + b.diversityPenalty)}</td>
                <td>${Math.round(b.total)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderScenarioSummary() {
  if (!state.scenarioResults.length) {
    dom.scenarioSummary.innerHTML = '<p class="empty-note">시나리오 분석 결과 파일을 찾지 못했습니다.</p>';
    return;
  }
  dom.scenarioSummary.innerHTML = state.scenarioResults
    .map((scenario) => {
      const fast = scenario.routes["빠른 장보기"]?.metrics;
      const coexist = scenario.routes["상생형"]?.metrics;
      return `
        <div class="scenario-row">
          <strong>${escapeHtml(scenario.scenario)}</strong>
          <span>${escapeHtml(scenario.categories.join(", "))}</span>
          <span>빠른 ${formatNumber(fast?.총거리_m)}m · 상생 외곽 ${formatNumber(coexist?.외곽부점포수)}곳</span>
        </div>
      `;
    })
    .join("");
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

async function loadData() {
  const fallback = window.DAEJEON_MARKET_DATA;
  const isFile = window.location.protocol === "file:";
  if (isFile && fallback) {
    return {
      geojson: fallback.geojson,
      metadata: fallback.metadata,
      shoppingSummary: fallback.shoppingSummary || null,
      scenarioResults: [],
    };
  }
  try {
    const [geojson, metadata, shoppingSummary, scenarioResults] = await Promise.all([
      loadJson("./data/stores_enriched.geojson").catch(() => loadJson("./data/stores.geojson")),
      loadJson("./data/metadata.json"),
      loadJson("./data/shopping-category-summary.json").catch(() => null),
      loadJson("./data/route-scenario-results.json").catch(() => []),
    ]);
    return { geojson, metadata, shoppingSummary, scenarioResults };
  } catch (error) {
    if (fallback) {
      return {
        geojson: fallback.geojson,
        metadata: fallback.metadata,
        shoppingSummary: fallback.shoppingSummary || null,
        scenarioResults: [],
      };
    }
    throw error;
  }
}

async function init() {
  const { geojson, metadata, shoppingSummary, scenarioResults } = await loadData();
  ensureEnriched(geojson.features);
  state.features = geojson.features.sort((a, b) => a.properties.distanceM - b.properties.distanceM);
  state.metadata = metadata;
  state.shoppingSummary = shoppingSummary;
  state.scenarioResults = scenarioResults;
  computeEntrances();
  renderStartOptions();
  renderStats();
  renderAreaLayers();
  renderEntranceMarkers();
  renderMarkers();
  renderRecommendations();
  fitToData();
  if (map) {
    setTimeout(() => {
      map.invalidateSize();
      fitToData();
    }, 250);
  }
}

[dom.searchInput, dom.categorySelect, dom.shoppingCategorySelect, dom.zoneSelect, dom.directOnly].forEach(
  (control) => control.addEventListener("input", renderMarkers)
);

[dom.showCoreArea, dom.showDistanceRings].forEach((control) =>
  control.addEventListener("change", renderAreaLayers)
);

dom.fitButton.addEventListener("click", fitToData);
dom.heatButton.addEventListener("click", () => {
  state.heatMode = !state.heatMode;
  dom.heatButton.setAttribute("aria-pressed", String(state.heatMode));
  renderMarkers();
});
dom.duplicateMode.addEventListener("change", () => {
  state.duplicateMode = dom.duplicateMode.checked;
  renderMarkers();
});
dom.storeList.addEventListener("click", (event) => {
  const button = event.target.closest(".store-item");
  if (!button) return;
  const feature = state.features.find((item) => item.properties.id === button.dataset.id);
  if (feature) selectFeature(feature, true);
});
dom.candidateResults.addEventListener("click", (event) => {
  const button = event.target.closest(".candidate-card");
  if (!button) return;
  const feature = state.features.find((item) => item.properties.id === button.dataset.id);
  if (feature) selectFeature(feature, true);
});
dom.shoppingChecklist.addEventListener("change", renderRecommendations);
dom.includeOuter.addEventListener("change", renderRecommendations);
dom.diversityMode.addEventListener("change", renderRecommendations);
dom.startMode.addEventListener("change", () => {
  updateStartDescription();
  renderRecommendations();
});
dom.routeButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-route-type]");
  if (!button) return;
  state.routeType = button.dataset.routeType;
  renderRouteButtons();
  renderRecommendations();
});

if (map) {
  map.on("click", (event) => {
    if (dom.startMode.value !== "custom") return;
    state.customStart = {
      lat: event.latlng.lat,
      lon: event.latlng.lng,
      label: "지도 선택 위치",
    };
    updateStartDescription();
    renderRecommendations();
  });
}

init().catch((error) => {
  console.error(error);
  dom.summaryText.textContent = "데이터를 불러오지 못했습니다. 로컬 서버 또는 배포 파일 구성을 확인하세요.";
});













