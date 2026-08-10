// Prueba local del modelo Two-Tower, sin AWS.
//
// Carga los artefactos de ml/artifacts/ desde disco y los pasa por el MISMO código de
// inferencia que corre en la Lambda (buildQueryVector / topK de
// app-code/src/user/twoTowerModel.ts). Lo único que se reemplaza es de dónde salen los
// bytes (disco en vez de S3) y el puente modelo->catálogo (identidad en vez de un Scan de
// MoviesTable), así que lo que se valida acá es el modelo entrenado + la inferencia en TS.
//
// Uso (dentro del contenedor toolbox):
//   npm run --prefix /workspace/app-code -s tt -- "The Matrix" "Inception" ...
// o directo:
//   node_modules/.bin/esbuild ../ml/scripts/two-tower-local.ts --bundle --platform=node \
//     --outfile=/tmp/tt.js && node /tmp/tt.js "The Matrix" "Inception"
//
// Sin argumentos usa un historial de ejemplo. Con --top N cambia cuántas recomendaciones
// imprime.

import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import {
  buildQueryVector,
  topK,
  type CatalogItem,
  type TwoTowerModel,
} from "../../app-code/src/user/twoTowerModel";

const TRAILING_ARTICLE = /^(.+),\s*(the|an|a|les|le|la|l|el|los|las|il|der|die|das|den|det|de)$/;

/**
 * Colapsa un título a una clave comparable. Es solo para esta CLI: sirve para poder tipear
 * "The Matrix" y encontrar el "Matrix, The (1999)" de MovieLens. La Lambda NO cruza por
 * título — usa (source, externalId), ver buildCatalogBridge en twoTowerModel.ts.
 *
 * El artículo al final tiene que moverse ANTES de sacar la puntuación: después no queda
 * ninguna coma donde anclar.
 */
function normalizeTitle(raw: string): string {
  let title = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos combinantes: "Amélie" -> "Amelie"
    .toLowerCase()
    .trim();

  title = title.replace(/\s*\(\d{4}\)\s*$/, "");

  const article = TRAILING_ARTICLE.exec(title);
  if (article) {
    const [, rest, word] = article;
    title = word === "l" ? `l${rest}` : `${word} ${rest}`;
  }

  return title.replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * ml/artifacts buscándolo hacia arriba desde el cwd. No se usa __dirname porque el script se
 * corre bundleado (esbuild deja el bundle en /tmp y __dirname apuntaría ahí).
 */
function findArtifacts(): string {
  if (process.env.ARTIFACTS_DIR) {
    return process.env.ARTIFACTS_DIR;
  }
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, "ml", "artifacts");
    if (existsSync(join(candidate, "catalog.json"))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        "No encontré ml/artifacts/catalog.json. Descomprimí two_tower_artifacts.zip en " +
          "ml/artifacts/ o exportá ARTIFACTS_DIR."
      );
    }
    dir = parent;
  }
}

const ARTIFACTS = resolve(findArtifacts());

function readFloat32(name: string): Float32Array {
  const buf = readFileSync(join(ARTIFACTS, name));
  // Copia: el Buffer de Node puede venir con un byteOffset no alineado a 4.
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(ARTIFACTS, name), "utf-8")) as T;
}

function flatten(rows: number[][]): Float32Array {
  const cols = rows.length > 0 ? rows[0].length : 0;
  const out = new Float32Array(rows.length * cols);
  rows.forEach((row, i) => out.set(row, i * cols));
  return out;
}

/**
 * Igual que loadModel() de la Lambda, pero desde disco y con el puente en identidad: cada
 * fila del modelo "existe" en el catálogo con movieId `ml-<mlMovieId>`. Así el ranking que
 * se imprime es el del modelo puro, sin el recorte que impone el catálogo real de la app.
 */
function loadLocalModel(): TwoTowerModel {
  const catalogFile = readJson<{ dim: number; count: number; items: CatalogItem[] }>("catalog.json");
  const tower = readJson<{ hidden: number; w1: number[][]; b1: number[]; w2: number[][]; b2: number[] }>(
    "query_tower.json"
  );

  const { dim, count, items } = catalogFile;
  const itemVectors = readFloat32("item_vectors.f32");
  const poolEmbeddings = readFloat32("pool_embeddings.f32");

  if (itemVectors.length !== count * dim || poolEmbeddings.length !== count * dim) {
    throw new Error(
      `Artefactos inconsistentes: catalog.json dice ${count}x${dim}, ` +
        `pero hay ${itemVectors.length} y ${poolEmbeddings.length} floats`
    );
  }

  const movieIdByIndex = items.map((item) => `ml-${item.mlMovieId}`);
  const indexByMovieId: Record<string, number> = Object.create(null);
  movieIdByIndex.forEach((movieId, i) => (indexByMovieId[movieId] = i));

  const popularIndices = items.map((_, i) => i).sort((a, b) => items[a].popRank - items[b].popRank);

  return {
    dim,
    count,
    itemVectors,
    poolEmbeddings,
    queryTower: {
      hidden: tower.hidden,
      w1: flatten(tower.w1),
      b1: Float32Array.from(tower.b1),
      w2: flatten(tower.w2),
      b2: Float32Array.from(tower.b2),
    },
    catalog: items,
    movieIdByIndex,
    indexByMovieId,
    popularIndices,
    catalogSize: count,
  };
}

/** Chequeos que la Lambda da por sentados: formas, normas y rango de los vectores. */
function checkInvariants(model: TwoTowerModel): void {
  const { dim, count, itemVectors } = model;

  let worstNorm = 0;
  for (let i = 0; i < count; i++) {
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      const v = itemVectors[i * dim + d];
      norm += v * v;
    }
    worstNorm = Math.max(worstNorm, Math.abs(Math.sqrt(norm) - 1));
  }

  const finite = itemVectors.every(Number.isFinite) && model.poolEmbeddings.every(Number.isFinite);

  console.log(`ítems            ${count}`);
  console.log(`dim              ${dim} (hidden ${model.queryTower.hidden})`);
  console.log(`item_vectors L2  desvío máximo de 1.0: ${worstNorm.toExponential(2)}`);
  console.log(`sin NaN/Inf      ${finite ? "sí" : "NO — artefactos corruptos"}`);
  if (worstNorm > 1e-3 || !finite) {
    throw new Error("Los artefactos no cumplen lo que la Lambda asume");
  }
}

/** Resuelve un título escrito a mano contra el catálogo del modelo (ver normalizeTitle). */
function resolveTitles(model: TwoTowerModel, titles: string[]): number[] {
  const byTitleYear: Record<string, number> = Object.create(null);
  const byTitle: Record<string, number> = Object.create(null);
  model.catalog.forEach((item, i) => {
    const key = normalizeTitle(item.title);
    if (item.year !== null) {
      byTitleYear[`${key}|${item.year}`] = i;
    }
    const incumbent = byTitle[key];
    if (incumbent === undefined || model.catalog[incumbent].popRank > item.popRank) {
      byTitle[key] = i;
    }
  });

  const resolved: number[] = [];
  for (const raw of titles) {
    const yearMatch = /\((\d{4})\)\s*$/.exec(raw);
    const key = normalizeTitle(raw);
    const index = yearMatch ? byTitleYear[`${key}|${yearMatch[1]}`] ?? byTitle[key] : byTitle[key];
    if (index === undefined) {
      console.log(`  ! "${raw}" no está en el modelo — se ignora`);
      continue;
    }
    const item = model.catalog[index];
    console.log(`  · ${item.title} (${item.year})  [fila ${index}, popRank ${item.popRank}]`);
    resolved.push(index);
  }
  return resolved;
}

function printRanking(model: TwoTowerModel, scored: { index: number; score?: number }[]): void {
  scored.forEach((entry, rank) => {
    const item = model.catalog[entry.index];
    const score = entry.score === undefined ? "" : `  ${entry.score.toFixed(4)}`;
    console.log(
      `  ${String(rank + 1).padStart(2)}.${score}  ${item.title} (${item.year})  ` +
        `${item.genres.join("/")}`
    );
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const topIndex = args.indexOf("--top");
  const limit = topIndex >= 0 ? parseInt(args[topIndex + 1], 10) || 10 : 10;
  const titles = (topIndex >= 0 ? [...args.slice(0, topIndex), ...args.slice(topIndex + 2)] : args).filter(Boolean);

  const history = titles.length > 0 ? titles : ["The Matrix", "Terminator 2: Judgment Day", "Alien", "Blade Runner"];

  const metrics = readJson<any>("metrics.json");
  console.log(`\n=== Artefactos (${ARTIFACTS}) ===`);
  console.log(`modelVersion     ${metrics.modelVersion}  (dataset ${metrics.dataset})`);
  const model = loadLocalModel();
  checkInvariants(model);

  console.log(
    `\ntest recall@10   ${metrics.model["recall@10"].toFixed(4)}  ` +
      `vs most-popular ${metrics.popularityBaseline["recall@10"].toFixed(4)}  ` +
      `(${(metrics.model["recall@10"] / metrics.popularityBaseline["recall@10"]).toFixed(1)}x)`
  );

  console.log(`\n=== Historial ===`);
  const historyIndices = resolveTitles(model, history);

  const excluded = new Uint8Array(model.count);
  historyIndices.forEach((index) => (excluded[index] = 1));

  if (historyIndices.length === 0) {
    console.log(`\n=== Fallback de popularidad (historial vacío, strategy="popularity") ===`);
    printRanking(
      model,
      model.popularIndices.slice(0, limit).map((index) => ({ index }))
    );
    return;
  }

  const started = Date.now();
  const query = buildQueryVector(model, historyIndices.slice(0, 30)); // MAX_QUERY_HISTORY
  const scored = topK(model, query, excluded, limit);
  const elapsed = Date.now() - started;

  console.log(`\n=== Recomendaciones (strategy="two-tower", ${elapsed}ms) ===`);
  printRanking(model, scored);

  console.log(`\n=== Baseline most-popular, mismo historial excluido ===`);
  printRanking(
    model,
    model.popularIndices.filter((index) => !excluded[index]).slice(0, limit).map((index) => ({ index }))
  );
  console.log();
}

main();
