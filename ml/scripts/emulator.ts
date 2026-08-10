// Prueba del endpoint /recommendations/ml contra el emulador local (floci), sin AWS.
//
// A diferencia de two-tower-local.ts —que solo ejercita el modelo— acá corre el handler
// REAL de la Lambda: el Scan que arma el puente modelo->catálogo, el GetObject de los
// artefactos, el Query del historial por la GSI recent-index y el BatchGet del catálogo.
// Lo único que cambia respecto de producción es a dónde apuntan los SDKs (AWS_ENDPOINT_URL).
//
// Uso (dentro del contenedor toolbox, con `docker compose up -d aws-emulator`):
//   npm run --prefix /workspace/app-code emu:setup     # crea tablas/bucket y siembra datos
//   npm run --prefix /workspace/app-code emu:invoke     # llama al handler e imprime la respuesta
//
// El catálogo sembrado imita al de la app después de la importación de MovieLens: movieId
// opaco (uuid, otro espacio de ids) más `source: "movielens"` y `externalId` = el movieId de
// MovieLens. Ese par es el único puente que usa la Lambda, así que acá se siembra igual.
// Se agregan además dos controles: una fila de MovieLens con un externalId que el modelo no
// vio, y una fila de otra fuente (sin source), que el Scan filtra del lado del servidor.

import { readFileSync } from "fs";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// ── Nombres locales. Los reales los genera CloudFormation; acá se fijan a mano y se le
//    pasan al handler por variable de entorno, igual que hace el stack.
export const TABLE_MOVIES = "LocalMoviesTable";
export const TABLE_WATCH_HISTORY = "LocalWatchHistoryTable";
export const TABLE_PROFILES = "LocalProfilesTable";
export const BUCKET = "tt-model-artifacts";
export const PREFIX = "two-tower/v1/";

export const USER_ID = "local-user";
export const PROFILE_ID = "local-profile";
export const EMPTY_PROFILE_ID = "local-profile-nuevo";

// Cuántos ítems del modelo llegan al catálogo. El catálogo real importa solo una parte de
// MovieLens (el resto de las filas viene de la otra fuente), así que sembrar el 100% daría
// una cobertura irrealmente perfecta: se siembran los CATALOG_ITEMS más populares.
const CATALOG_ITEMS = 3000;

// Historial de la demo. Tienen que existir en el catálogo sembrado (son todos populares).
const HISTORY_TITLES = ["The Matrix", "Terminator 2: Judgment Day", "Alien", "Blade Runner"];

const ARTIFACT_FILES = ["item_vectors.f32", "pool_embeddings.f32", "query_tower.json", "catalog.json"];

interface CatalogItem {
  mlMovieId: number;
  title: string;
  year: number | null;
  genres: string[];
  popRank: number;
}

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
      throw new Error("No encontré ml/artifacts/catalog.json — descomprimí los artefactos primero");
    }
    dir = parent;
  }
}

const ARTIFACTS = resolve(findArtifacts());

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb, { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({ forcePathStyle: true });

async function recreateTable(name: string, definition: any): Promise<void> {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: name }));
    await ddb.send(new DeleteTableCommand({ TableName: name }));
  } catch {
    // no existía
  }
  await ddb.send(new CreateTableCommand({ TableName: name, BillingMode: "PAY_PER_REQUEST", ...definition }));
  console.log(`  tabla ${name}`);
}

async function batchWrite(table: string, items: any[]): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: { [table]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) },
      })
    );
  }
}

/** movieId opaco y estable, del mismo estilo que el uuid v5 que usa el catálogo real. */
function fakeMovieId(mlMovieId: number): string {
  const hex = (mlMovieId * 2654435761).toString(16).padStart(12, "0").slice(-12);
  return `00000000-0000-5000-8000-${hex}`;
}

async function setup(): Promise<void> {
  console.log(`\n=== Creando recursos en ${process.env.AWS_ENDPOINT_URL} ===`);

  await recreateTable(TABLE_MOVIES, {
    AttributeDefinitions: [{ AttributeName: "movieId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "movieId", KeyType: "HASH" }],
  });

  await recreateTable(TABLE_WATCH_HISTORY, {
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "movieId", AttributeType: "S" },
      { AttributeName: "lastWatchedAt", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "movieId", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "recent-index",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "lastWatchedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await recreateTable(TABLE_PROFILES, {
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "profileId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "profileId", KeyType: "RANGE" },
    ],
  });

  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch {
    // ya existía
  }
  console.log(`  bucket ${BUCKET}`);

  // ── Artefactos del modelo, al mismo prefijo que espera la Lambda
  for (const name of ARTIFACT_FILES) {
    const body = readFileSync(join(ARTIFACTS, name));
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}${name}`, Body: body }));
    console.log(`  s3://${BUCKET}/${PREFIX}${name}  (${(body.byteLength / 1e6).toFixed(2)} MB)`);
  }

  // ── Catálogo: los CATALOG_ITEMS ítems más populares del modelo, en forma de fila de la app
  const catalog: CatalogItem[] = JSON.parse(readFileSync(join(ARTIFACTS, "catalog.json"), "utf-8")).items;
  const seeded = [...catalog].sort((a, b) => a.popRank - b.popRank).slice(0, CATALOG_ITEMS);

  const movies: Record<string, any>[] = seeded.map((item) => ({
    movieId: fakeMovieId(item.mlMovieId),
    // El par que arma el puente modelo->catálogo, igual que lo escribe la importación.
    source: "movielens",
    externalId: String(item.mlMovieId),
    title: item.title,
    releaseYear: item.year ?? undefined,
    genreId: item.genres[0]?.toLowerCase(),
    synopsis: `Sembrada localmente para probar el recomendador.`,
    // La mitad con video listo, para poder probar también readyOnly=true.
    videoStatus: item.popRank % 2 === 0 ? "ready" : "pending",
  }));

  // Control 1: fila de MovieLens con un id que el modelo nunca vio. Cuenta en catalogSize,
  // nunca se recomienda.
  movies.push({
    movieId: fakeMovieId(999999),
    source: "movielens",
    externalId: "999999",
    title: "Una Película Que El Modelo No Conoce",
    releaseYear: 2024,
    genreId: "drama",
    synopsis: "Control: no debería aparecer nunca en las recomendaciones.",
    videoStatus: "ready",
  });

  // Control 2: fila de la otra fuente de catálogo (sin source/externalId) con un título que sí
  // está en el modelo. El filtro del Scan la deja afuera: no se recomienda ni cuenta.
  movies.push({
    movieId: fakeMovieId(888888),
    title: seeded[0].title,
    releaseYear: seeded[0].year ?? undefined,
    genreId: "drama",
    synopsis: "Control: misma película que el modelo conoce, pero de otra fuente.",
    videoStatus: "ready",
  });

  await batchWrite(TABLE_MOVIES, movies);
  console.log(`  ${movies.length} películas en ${TABLE_MOVIES}`);

  // ── Perfiles: uno con historial y otro vacío, para probar el fallback de popularidad
  //    (el caso de un perfil recién creado, que es lo que se ve al abrir la demo).
  await batchWrite(TABLE_PROFILES, [
    { userId: USER_ID, profileId: PROFILE_ID, name: "Demo", createdAt: new Date().toISOString() },
    { userId: USER_ID, profileId: EMPTY_PROFILE_ID, name: "Perfil nuevo", createdAt: new Date().toISOString() },
  ]);

  // ── Historial, con la misma clave compuesta que escribe updateWatchProgress.ts
  const byTitle = new Map(seeded.map((item) => [item.title, item]));
  const history = HISTORY_TITLES.map((title, i) => {
    const item = byTitle.get(title);
    if (!item) {
      throw new Error(`"${title}" no quedó en el catálogo sembrado — subí CATALOG_ITEMS`);
    }
    return {
      userId: `${USER_ID}#${PROFILE_ID}`,
      movieId: fakeMovieId(item.mlMovieId),
      lastWatchedAt: new Date(Date.now() - (HISTORY_TITLES.length - i) * 3600_000).toISOString(),
      progressSeconds: 3600,
      completed: true,
    };
  });
  await batchWrite(TABLE_WATCH_HISTORY, history);
  console.log(`  ${history.length} entradas de historial: ${HISTORY_TITLES.join(", ")}`);

  console.log(`\nListo. Ahora: npm run emu:invoke\n`);
}

async function invoke(): Promise<void> {
  // Se importa acá y no arriba: el handler lee TABLE_* al cargar el módulo, así que las
  // variables de entorno tienen que estar puestas antes del require.
  process.env.TABLE_MOVIES = TABLE_MOVIES;
  process.env.TABLE_WATCH_HISTORY = TABLE_WATCH_HISTORY;
  process.env.TABLE_PROFILES = TABLE_PROFILES;
  process.env.BUCKET_MODEL_ARTIFACTS = BUCKET;
  process.env.MODEL_ARTIFACT_PREFIX = PREFIX;
  process.env.MODEL_VERSION = process.env.MODEL_VERSION || "v1";

  const { handler } = require("../../app-code/src/user/getTwoTowerRecommendations");

  // Los argumentos sueltos van al query string, salvo profileId, que va al path.
  const queryStringParameters: Record<string, string> = {};
  let profileId = PROFILE_ID;
  for (const arg of process.argv.slice(3)) {
    const [key, value] = arg.split("=");
    if (!key || !value) {
      continue;
    }
    if (key === "profileId") {
      profileId = value === "empty" ? EMPTY_PROFILE_ID : value;
    } else {
      queryStringParameters[key] = value;
    }
  }

  // Evento de API Gateway con el authorizer ya resuelto, como lo entrega el Cognito authorizer.
  const event = {
    pathParameters: { userId: USER_ID, profileId },
    queryStringParameters,
    requestContext: {
      authorizer: { claims: { sub: USER_ID, scope: "catalog:read" } },
    },
  };

  console.log(`\n=== GET /v1/users/${USER_ID}/profiles/${profileId}/recommendations/ml`, queryStringParameters);

  const cold = Date.now();
  const first = await handler(event);
  const coldMs = Date.now() - cold;

  const warm = Date.now();
  const second = await handler(event);
  const warmMs = Date.now() - warm;

  console.log(`\nstatus ${first.statusCode}   arranque en frío ${coldMs}ms   tibio ${warmMs}ms`);

  const body = JSON.parse(first.body);
  if (first.statusCode !== 200) {
    console.log(body);
    process.exitCode = 1;
    return;
  }

  console.log(`strategy ${body.strategy}   modelVersion ${body.modelVersion}`);
  console.log(`coverage`, body.coverage);
  console.log(`\n${body.items.length} recomendaciones:`);
  body.items.forEach((movie: any, i: number) => {
    const score = movie.score === undefined ? "      " : movie.score.toFixed(4);
    console.log(
      `  ${String(i + 1).padStart(2)}.  ${score}  ${movie.title} (${movie.releaseYear})  [${movie.videoStatus}]`
    );
  });

  // El mismo evento dos veces tiene que dar lo mismo: el modelo se cachea por contenedor y
  // el ranking no depende del orden del Scan.
  const same = JSON.stringify(JSON.parse(second.body).items) === JSON.stringify(body.items);
  console.log(`\nsegunda llamada idéntica: ${same ? "sí" : "NO — el ranking no es determinista"}`);
  console.log();
}

async function main(): Promise<void> {
  if (!process.env.AWS_ENDPOINT_URL) {
    throw new Error("Falta AWS_ENDPOINT_URL — este script solo habla con el emulador local");
  }
  const command = process.argv[2];
  if (command === "setup") {
    await setup();
  } else if (command === "invoke") {
    await invoke();
  } else {
    throw new Error(`Uso: emulator.ts <setup|invoke> [limit=10] [readyOnly=true]`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
