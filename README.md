# 🎬 Netflix Clone - Cloud Infrastructure with AWS CDK

## 📖 Descripción del Proyecto

Este repositorio contiene la definición completa de infraestructura como código (Infrastructure as Code - IaC) para un sistema inspirado en la arquitectura de plataformas de streaming como Netflix.

El proyecto fue desarrollado para la materia de **Cloud Computing**, utilizando una arquitectura **serverless**, orientada a eventos y basada completamente en servicios administrados de AWS.

La infraestructura está implementada mediante **AWS CDK v2** y **TypeScript**, permitiendo automatizar el aprovisionamiento, despliegue y mantenimiento de todos los recursos cloud utilizados por la plataforma.

El sistema implementa funcionalidades como:

* Gestión de catálogo de películas
* Gestión de géneros
* Historial de reproducción
* Listas personalizadas de usuario
* Sesiones de streaming
* Procesamiento automático de videos
* Pipeline de transcodificación multimedia
* Arquitectura basada en microservicios serverless

---

# ☁️ Arquitectura Cloud

El proyecto utiliza una arquitectura basada en servicios administrados de AWS para maximizar:

* escalabilidad,
* disponibilidad,
* desacoplamiento,
* elasticidad,
* y reducción de costos operativos.

## 🏗️ Arquitectura General

```text
Client Application
        │
        ▼
Amazon API Gateway
        │
        ▼
AWS Lambda Microservices
        │
        ├──────────────► Amazon DynamoDB
        │
        ├──────────────► Amazon S3
        │
        └──────────────► AWS Elemental MediaConvert
                                │
                                ▼
                         Amazon EventBridge
                                │
                                ▼
                         AWS Lambda Callback
```

---

# 🎬 Pipeline de Procesamiento de Video

El sistema implementa un pipeline automatizado de procesamiento multimedia orientado a plataformas de streaming.

## Flujo del procesamiento

```text
1. Usuario sube archivo .mp4 a S3
                ↓
2. Evento ObjectCreated en S3
                ↓
3. Lambda triggerTranscodeFn
                ↓
4. AWS Elemental MediaConvert procesa el video
                ↓
5. EventBridge detecta cambios de estado
                ↓
6. Lambda transcodeCallbackFn
                ↓
7. Actualización de metadatos en DynamoDB
```

Este enfoque permite automatizar completamente el procesamiento multimedia sin intervención manual.

---

# 🧩 Arquitectura de Microservicios

La solución se encuentra dividida en dominios independientes.

| Microservicio | Responsabilidad                         |
| ------------- | --------------------------------------- |
| Catalog       | Gestión CRUD de películas               |
| Genres        | Administración y consulta de géneros    |
| Streaming     | Gestión de sesiones y transcodificación |
| User          | Historial y listas personalizadas       |

---

# ☁️ Servicios AWS Utilizados

| Servicio AWS               | Propósito                              |
| -------------------------- | -------------------------------------- |
| AWS CDK                    | Infraestructura como código            |
| AWS Lambda                 | Ejecución serverless de lógica backend |
| Amazon API Gateway         | Exposición de API REST                 |
| Amazon DynamoDB            | Persistencia NoSQL                     |
| Amazon S3                  | Almacenamiento de videos               |
| AWS Elemental MediaConvert | Transcodificación multimedia           |
| Amazon EventBridge         | Orquestación basada en eventos         |
| AWS IAM                    | Gestión de permisos y seguridad        |
| Amazon CloudWatch          | Logs y monitoreo automático            |

---

# 🗄️ Diseño de Base de Datos NoSQL

El proyecto utiliza Amazon DynamoDB con un diseño orientado a consultas eficientes mediante índices secundarios globales (GSI).

## Tablas implementadas

| Tabla           | Descripción                            |
| --------------- | -------------------------------------- |
| movies          | Catálogo principal de películas        |
| video_assets    | Información de videos transcodificados |
| genres          | Catálogo de géneros                    |
| user_lists      | Listas personalizadas de usuarios      |
| watch_history   | Historial de visualización             |
| stream_sessions | Sesiones activas de streaming          |

## Índices Globales Secundarios (GSI)

| Índice         | Propósito             |
| -------------- | --------------------- |
| genre-index    | Búsqueda por género   |
| director-index | Búsqueda por director |
| year-index     | Búsqueda por año      |
| recent-index   | Historial reciente    |
| user-index     | Consultas por usuario |

---

# 📡 API REST

La infraestructura expone una API REST mediante Amazon API Gateway.

## Endpoints principales

### 🎞️ Películas

| Método | Endpoint               |
| ------ | ---------------------- |
| GET    | `/v1/movies`           |
| POST   | `/v1/movies`           |
| POST   | `/v1/movies/import`    |
| GET    | `/v1/movies/{movieId}` |
| PUT    | `/v1/movies/{movieId}` |
| DELETE | `/v1/movies/{movieId}` |

---

### 🎭 Géneros

| Método | Endpoint                      |
| ------ | ----------------------------- |
| GET    | `/v1/genres`                  |
| GET    | `/v1/genres/{genreId}`        |
| GET    | `/v1/genres/{genreId}/movies` |

---

### ▶️ Streaming

| Método | Endpoint                             |
| ------ | ------------------------------------ |
| POST   | `/v1/streaming/sessions`             |
| GET    | `/v1/streaming/sessions/{sessionId}` |
| DELETE | `/v1/streaming/sessions/{sessionId}` |

---

### 👤 Usuarios

| Método | Endpoint                               |
| ------ | -------------------------------------- |
| GET    | `/v1/users/{userId}/lists`             |
| POST   | `/v1/users/{userId}/lists`             |
| DELETE | `/v1/users/{userId}/lists/{movieId}`   |
| GET    | `/v1/users/{userId}/history`           |
| PUT    | `/v1/users/{userId}/history/{movieId}` |
| DELETE | `/v1/users/{userId}/history/{movieId}` |

---

### 🤖 Recomendaciones

| Método | Endpoint                                                     | Motor                     |
| ------ | ------------------------------------------------------------ | ------------------------- |
| GET    | `/v1/users/{userId}/profiles/{profileId}/recommendations`     | Heurística por género     |
| GET    | `/v1/users/{userId}/profiles/{profileId}/recommendations/ml`  | Modelo Two-Tower (IA)     |

---

# 🧠 Recomendador Two-Tower

El endpoint `/recommendations/ml` sirve un modelo de **recuperación Two-Tower** entrenado sobre
**MovieLens 20M** con TensorFlow/Keras. Convive con el endpoint heurístico, que queda intacto,
para poder comparar los dos en la demo.

## Arquitectura

Dos torres que comparten la tabla de embeddings de ítems:

| Torre     | Entrada                          | Salida                                             |
| --------- | -------------------------------- | -------------------------------------------------- |
| **Item**  | índice de película               | `E[i] → Dense(128, relu) → Dense(64) → L2`          |
| **Query** | historial (hasta 30 vistas)      | `mean(E[h]) → Dense(128, relu) → Dense(64) → L2`    |

Puntuar es un producto punto entre las dos salidas. La torre de query **promedia el historial**
en lugar de usar un embedding por `user_id`: así el modelo puntúa a cualquier perfil de la app
con al menos una película vista, sin reentrenar ni precalcular nada por perfil.

Entrenamiento con softmax muestreado in-batch (los negativos son los positivos de las otras
filas del lote) más corrección logQ por popularidad. Evaluación con **recall@K** y **nDCG@K**
(K = 10, 20, 50, 100) sobre un split *leave-one-out* cronológico, rankeando contra el catálogo
completo, comparado contra un baseline de *most-popular*. Los números de la corrida quedan en
`ml/artifacts/metrics.json`.

## Entrenar y publicar el modelo

1. Abrir `ml/notebooks/two_tower_movielens.ipynb` en **Google Colab gratis** (T4 recomendado) y
   correr todas las celdas. Baja MovieLens 20M, entrena, imprime la tabla de métricas y deja
   `two_tower_artifacts.zip` para descargar.
2. Descomprimirlo en `ml/artifacts/` (ignorado por git: son blobs de varios MB, viven en S3).
3. Subirlo desde el contenedor `toolbox`:

```bash
docker compose run --rm toolbox bash

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ProyectoNetflixInfraStack \
  --query "Stacks[0].Outputs[?OutputKey=='ModelArtifactsBucketName'].OutputValue" \
  --output text)

aws s3 sync ml/artifacts "s3://$BUCKET/two-tower/v1/"
```

El prefijo `two-tower/v1/` es la variable de entorno `MODEL_ARTIFACT_PREFIX` de la Lambda. Para
publicar una versión nueva sin tocar la que está sirviendo: subir a `two-tower/v2/`, cambiar la
variable y desplegar; el rollback es volver a apuntar el prefijo.

## Cómo sirve la Lambda

`app-code/src/user/getTwoTowerRecommendations.ts` (TypeScript, sin dependencias de ML: la
inferencia son dos capas densas y un producto punto sobre `Float32Array`). En el arranque en
frío baja los artefactos de S3 y los cachea por contenedor; las invocaciones tibias solo hacen
las queries a DynamoDB.

Los `movieId` de MovieLens y los del catálogo son espacios de ids distintos, así que en el
mismo arranque en frío la Lambda escanea `MoviesTable` y cruza ambos por el par que escribe la
importación: **`source: "movielens"` y `externalId` = el `movieId` de MovieLens** (el mismo id
que `catalog.json` llama `mlMovieId`). El Scan filtra por `source` del lado del servidor, así
que las filas de la otra fuente de catálogo no participan: solo las importadas desde MovieLens
se recomiendan. El campo `coverage` de la respuesta lo hace visible:

| Campo                   | Qué mide                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `modelItems`            | Ítems que tiene el modelo                                       |
| `catalogMatched`        | Cuántos de esos tienen película en el catálogo (recomendables)  |
| `catalogMovieLensRows`  | Filas con `source: "movielens"` encontradas en `MoviesTable`    |
| `historyRead`           | Entradas de historial leídas para el perfil                     |
| `historyMatched`        | Cuántas de esas cruzaron contra el modelo                       |

Si varias filas del catálogo comparten un mismo `externalId` (re-importaciones, duplicados),
todas se reconocen al leer el historial, pero una sola es la que sale recomendada — se elige
por `movieId` para que no dependa del orden del Scan.

| Parámetro         | Default | Descripción                                          |
| ----------------- | ------- | ---------------------------------------------------- |
| `limit`           | `10`    | Cantidad de recomendaciones (máx. 50)                |
| `readyOnly`       | `false` | Solo títulos con `videoStatus === "ready"`           |

La respuesta trae `strategy`: `"two-tower"` cuando el historial del perfil cruza con el modelo,
o `"popularity"` como fallback para perfiles nuevos.

## Probarlo localmente (sin AWS)

Tres niveles, de más rápido a más completo. Todo corre dentro del contenedor `toolbox`; hace
falta haber descomprimido los artefactos en `ml/artifacts/`.

**1. Tests unitarios** — no necesitan artefactos ni emulador:

```bash
docker compose exec toolbox sh -c 'cd /workspace/app-code && npx jest --runInBand'
```

`--runInBand` no es opcional: en paralelo los workers de jest se pasan de la memoria del
contenedor y Docker los mata con SIGKILL (aparece como "test suite failed to run").

**2. El modelo entrenado, contra los artefactos reales** (`ml/scripts/two-tower-local.ts`).
Carga los `.f32` desde disco y los pasa por el mismo `buildQueryVector`/`topK` de la Lambda,
con el puente modelo→catálogo en identidad. Sirve para ver si el entrenamiento quedó bien:

```bash
docker compose exec toolbox sh -c \
  'cd /workspace/app-code && npm run -s two-tower:local -- "The Matrix" "Alien" --top 10'
```

Valida formas y normas L2 de los artefactos, imprime el recall@10 de `metrics.json` y compara
el ranking del modelo contra el baseline de popularidad.

**3. El handler completo, contra el emulador** (`ml/scripts/emulator.ts`). Acá corre el handler
real: el `Scan` que arma el puente, el `GetObject` de los artefactos, el `Query` del historial
por la GSI `recent-index` y el `BatchGet` del catálogo. Lo único distinto de producción es a
dónde apuntan los SDKs (`AWS_ENDPOINT_URL`):

```bash
docker compose up -d aws-emulator

docker compose exec \
  -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test -e AWS_REGION=us-east-1 \
  -e AWS_ENDPOINT_URL=http://aws-emulator:4566 -e AWS_S3_FORCE_PATH_STYLE=true \
  toolbox sh -c 'cd /workspace/app-code && npm run -s emu:setup && npm run -s emu:invoke'
```

`emu:setup` crea las tablas y el bucket, sube los artefactos y siembra un catálogo que imita al
de la app: los 3.000 ítems más populares del modelo escritos como filas de `MoviesTable` con
`source: "movielens"` y `externalId` = el id de MovieLens — el mismo par que cruza el puente en
producción. Siembra además dos controles: una fila de MovieLens con un `externalId` que el
modelo nunca vio, y una fila de la otra fuente (sin `source`) cuyo título **sí** está en el
modelo, que el filtro del Scan tiene que dejar afuera.

`emu:invoke` arma el evento de API Gateway y llama al handler. Acepta argumentos sueltos:

```bash
npm run -s emu:invoke -- limit=5 readyOnly=true     # filtro por videoStatus
npm run -s emu:invoke -- profileId=empty            # perfil sin historial -> fallback
```

`AWS_S3_FORCE_PATH_STYLE` existe solo para esto: el direccionamiento virtual-host de S3 arma
`<bucket>.<host>`, que contra un contenedor no resuelve. En AWS la variable no está seteada y
el cliente queda igual que siempre.

---

# 🔐 Seguridad y Permisos IAM

La infraestructura aplica el principio de **mínimo privilegio** mediante AWS IAM.

Se implementan permisos específicos para:

* lectura de tablas DynamoDB,
* escritura controlada,
* acceso a buckets S3,
* ejecución de MediaConvert,
* delegación de roles mediante `PassRole`.

Esto permite mejorar la seguridad y reducir riesgos operativos.

---

# ⚡ Características Serverless

El proyecto utiliza una arquitectura completamente serverless.

## Beneficios obtenidos

* Escalabilidad automática
* Pago bajo demanda
* Eliminación de administración de servidores
* Alta disponibilidad
* Arquitectura desacoplada
* Despliegues automatizados

---

# 💰 Optimización de Costos

La solución fue diseñada considerando eficiencia económica.

## Estrategias utilizadas

* DynamoDB en modo `PAY_PER_REQUEST`
* AWS Lambda bajo demanda
* Procesamiento multimedia event-driven
* Recursos administrados serverless
* Escalado automático nativo

---

# 📂 Estructura del Proyecto

```text
proyectoNetflix-infra/
│
├── app-code/                 # Código backend y handlers Lambda
│
├── bin/                      # Punto de entrada CDK
│
├── lib/                      # Definición de stacks AWS
│
├── test/                     # Pruebas del proyecto
│
├── cdk.json                  # Configuración CDK
├── docker-compose.yml        # Configuración Docker
├── package.json              # Dependencias Node.js
├── tsconfig.json             # Configuración TypeScript
└── README.md
```

---

# 🛠️ Tecnologías Utilizadas

| Tecnología     | Uso                                |
| -------------- | ---------------------------------- |
| TypeScript     | Desarrollo tipado                  |
| Node.js        | Runtime backend                    |
| AWS CDK v2     | Infraestructura como código        |
| Jest           | Testing                            |
| esbuild        | Bundling y optimización de Lambdas |
| Docker Compose | Contenedores para desarrollo       |

---

# 🚀 Guía de Despliegue

## 1️⃣ Requisitos Previos

Instalar:

* Node.js 18+
* npm
* AWS CLI
* AWS CDK
* Git

---

## 2️⃣ Configurar Credenciales AWS

```bash
aws configure
```

Ingresar:

* AWS Access Key
* AWS Secret Access Key
* Región
* Output format

---

## 3️⃣ Instalar AWS CDK

```bash
npm install -g aws-cdk
```

Verificar instalación:

```bash
cdk --version
```

---

# 📥 Clonar el Repositorio

## Clonar incluyendo submódulos

```bash
git clone --recursive https://github.com/ESalinasCh/proyectoNetflix-infra.git
cd proyectoNetflix-infra
```

## Si el repositorio ya fue clonado

```bash
git submodule update --init --recursive
```

---

# 📦 Instalación de Dependencias

## Dependencias de infraestructura

```bash
npm install
```

## Dependencias del backend

```bash
cd app-code
npm install
cd ..
```

---

# ⚙️ Compilación del Proyecto

```bash
npm run build
```

---

# ☁️ Bootstrap de AWS CDK

Este paso solo debe ejecutarse una vez por cuenta/región AWS.

```bash
npx cdk bootstrap
```

---

# 🚀 Despliegue de Infraestructura

```bash
npx cdk deploy
```

> 🔑 **Importante:** Para que CDK compile correctamente, debes tener una llave pública RSA (`public_key.pem`) en la raíz del proyecto. Esta se usa para proteger el contenido de video mediante CloudFront Signed URLs.

---

# 📥 Poblar la Base de Datos Inicial

Una vez desplegada la infraestructura, debes inyectar contenido al catálogo para que la plataforma no esté vacía:

```bash
node upload_movies.js
```
*Este script subirá películas a DynamoDB y las encolará en los buckets de S3 para activar el flujo de transcodificación (o el Fallback automático si tu cuenta no tiene permisos sobre MediaConvert).*

---

# 🤖 Integración Continua (CI/CD)

El proyecto incluye flujos de **GitHub Actions** (`deploy.yml`) que compilan y despliegan tanto la infraestructura como el frontend (React/Vite).

Debido a las restricciones de las cuentas *AWS Academy / Sandbox* (que bloquean la asunción de roles OIDC), el pipeline requiere configurar los siguientes **GitHub Secrets** (*Settings → Secrets and variables → Actions → Secrets*):
* `AWS_ACCESS_KEY_ID`
* `AWS_SECRET_ACCESS_KEY`
* `AWS_REGION`

> ⚠️ Estas credenciales tienen que ser **de la misma cuenta AWS donde vive el stack** (la del bucket
> `netflix-web-<accountId>-us-east-1` y la distribución de CloudFront). Si apuntan a otra cuenta, el
> deploy falla con un error que no lo dice: `stack is in UPDATE_ROLLBACK_FAILED state` — porque
> encuentra un stack homónimo, viejo, en la cuenta equivocada. El paso **Verify AWS Account** del
> workflow ahora corta temprano con un mensaje explícito si eso ocurre.

### Variables de repositorio (no secretos)

El build del frontend necesita además estas **Variables** (*Settings → Secrets and variables →
Actions → **Variables***, no Secrets):

| Variable | Ejemplo | Requerida |
|---|---|---|
| `VITE_COGNITO_DOMAIN` | `netflix-clone-edward.auth.us-east-1.amazoncognito.com` | sí |
| `VITE_COGNITO_CLIENT_ID` | `g3eijlmli1uo5n27637b7h94d` | sí |
| `VITE_COGNITO_REGION` | `us-east-1` | sí |
| `VITE_COGNITO_SCOPES` | `openid profile email` | no |
| `VITE_API_BASE_URL` | `https://xxxx.execute-api.us-east-1.amazonaws.com/prod/v1` | sí |
| `AWS_ACCOUNT_ID` | `952804383463` | no (default en el workflow) |
| `FRONTEND_BUCKET` | `netflix-web-952804383463-us-east-1` | no (default en el workflow) |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E23Y4F01FGJWQP` | no (default en el workflow) |

Van como **variables y no como secretos** a propósito: Vite las inyecta en tiempo de *build*, así que
quedan embebidas en el JS que descarga cualquier visitante — no son secretas. Tratarlas como secretos
da una falsa sensación de protección y encima GitHub las enmascara en los logs, lo que complica
depurar. Los valores correctos son los mismos de `app-code/frontend/.env` (ver `.env.example`).

Sin estas variables el build **no falla solo**: genera un bundle con los valores de respaldo del
código (`VITE_API_BASE_URL` cae a `https://api.netflix-clone.com/v1`, que no existe) y el error recién
aparece en el navegador. Por eso el workflow valida que estén presentes antes de compilar.

Durante el despliegue, AWS CDK creará automáticamente:

* tablas DynamoDB,
* funciones Lambda,
* buckets S3,
* API Gateway,
* EventBridge,
* permisos IAM,
* reglas de eventos,
* integración MediaConvert.

---

# 🧪 Testing

Ejecutar pruebas:

```bash
npm test
```

---

# 🛠️ Comandos Útiles CDK

| Comando           | Descripción                     |
| ----------------- | ------------------------------- |
| `npx cdk synth`   | Genera plantilla CloudFormation |
| `npx cdk diff`    | Compara cambios locales         |
| `npx cdk deploy`  | Despliega infraestructura       |
| `npx cdk destroy` | Elimina recursos creados        |

---

# ⚠️ Consideraciones Académicas

Este proyecto fue desarrollado con fines educativos para la materia de **Cloud Computing**.

Algunas configuraciones como:

```ts
RemovalPolicy.DESTROY
```

fueron utilizadas únicamente para facilitar pruebas y despliegues académicos.

En ambientes de producción deberían utilizarse políticas más restrictivas y configuraciones avanzadas de seguridad.

---

# 📚 Conceptos Cloud Aplicados

El proyecto implementa múltiples conceptos de computación en la nube:

* Infrastructure as Code (IaC)
* Serverless Computing
* Event-Driven Architecture
* Microservices Architecture
* NoSQL Data Modeling
* Video Processing Pipelines
* Managed Cloud Services
* Automatic Scaling
* Least Privilege Security Model

---

# 👥 Integrantes

| Name | Role |
|------|------|
| Edward Salinas | Co-author |
| Richard Berna | Co-author |
| Jorge Siles | Co-author |
| Estiven Salinas | Co-author |

---

# 📄 Licencia

Proyecto desarrollado con fines académicos.
