# Netflix Clone - Infrastructure Setup

Este repositorio contiene la definición de infraestructura como código (IaC) utilizando AWS CDK y TypeScript. El código de la aplicación y las Lambdas se integra mediante **Git Submodules**.

## 🚀 Guía de Despliegue Rápido

### 1. Clonar el repositorio (con submódulos)
Descarga la infraestructura y el código de la aplicación en un solo paso:
```bash
git clone --recursive https://github.com/ESalinasCh/proyectoNetflix-infra.git
cd proyectoNetflix-infra
```
*Si clonaste el repositorio sin el flag `--recursive`, descarga el submódulo manualmente corriendo:*
```bash
git submodule update --init --recursive
```

### 2. Instalar dependencias
Debes instalar los paquetes en la raíz del proyecto y en el submódulo del código de la app:
```bash
# Dependencias de Infraestructura (Raíz)
npm install

# Dependencias de Handlers (Submódulo)
cd app-code
npm install
cd ..
```

### 3. Configuración y Despliegue a AWS
Asegúrate de configurar tus credenciales de AWS antes de continuar (`aws configure`).

```bash
# Preparar recursos del CDK (Solo la primera vez)
npx cdk bootstrap

# Desplegar los recursos a AWS
npx cdk deploy
```

---

## 🛠️ Comandos Útiles

* `npx cdk synth` — Emite la plantilla sintetizada de CloudFormation.
* `npx cdk diff` — Compara los recursos locales con lo desplegado.
* `git submodule update --remote` — Trae los últimos cambios del código de la aplicación.
