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

Debido a las restricciones de las cuentas *AWS Academy / Sandbox* (que bloquean la asunción de roles OIDC), el pipeline requiere configurar los siguientes **GitHub Secrets**:
* `AWS_ACCESS_KEY_ID`
* `AWS_SECRET_ACCESS_KEY`
* `AWS_REGION`

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
