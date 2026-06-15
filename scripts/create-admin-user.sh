#!/bin/bash
# =============================================================================
# Script para crear usuarios administradores en Cognito
# Uso: ./scripts/create-admin-user.sh
# Requisito: Tener sesión AWS activa (aws login)
# =============================================================================

set -e

REGION="us-east-1"
STACK_NAME="ProyectoNetflixInfraStack"

echo ""
echo "=================================================="
echo "  Netflix Clone — Creación de Usuario Admin"
echo "=================================================="
echo ""

# Verificar credenciales AWS
echo "🔐 Verificando credenciales AWS..."
if ! aws sts get-caller-identity --region "$REGION" > /dev/null 2>&1; then
  echo "❌ Error: No hay sesión AWS activa. Ejecuta 'aws login' primero."
  exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "✅ Autenticado en cuenta: $ACCOUNT"
echo ""

# Obtener el User Pool ID desde los outputs de CloudFormation
echo "📦 Obteniendo User Pool ID desde CloudFormation..."
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
  --output text 2>/dev/null)

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" == "None" ]; then
  echo "❌ No se encontró el User Pool. ¿Se hizo cdk deploy?"
  echo "   Ejecuta: cd proyectoNetflix-infra && cdk deploy"
  exit 1
fi

echo "✅ User Pool ID: $USER_POOL_ID"
echo ""

# Pedir datos del nuevo usuario
read -p "📧 Email del usuario admin (ej: admin@tudominio.com): " USER_EMAIL
if [ -z "$USER_EMAIL" ]; then
  echo "❌ El email no puede estar vacío"
  exit 1
fi

echo ""
echo "Selecciona el rol:"
echo "  1) super_admin  — Acceso total al panel admin"
echo "  2) content_admin — Acceso de escritura al catálogo"
read -p "Opción [1/2]: " ROLE_OPTION

case $ROLE_OPTION in
  1) GROUP_NAME="super_admin" ;;
  2) GROUP_NAME="content_admin" ;;
  *)
    echo "❌ Opción inválida"
    exit 1
    ;;
esac

echo ""
echo "=================================================="
echo "  Creando usuario: $USER_EMAIL"
echo "  Rol: $GROUP_NAME"
echo "=================================================="
echo ""

# Paso 1: Crear el usuario (con contraseña temporal)
echo "1️⃣  Creando usuario en Cognito..."
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER_EMAIL" \
  --temporary-password "Temp1234!" \
  --user-attributes \
    Name=email,Value="$USER_EMAIL" \
    Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region "$REGION" \
  --output json > /dev/null

echo "   ✅ Usuario creado"

# Paso 2: Asignar contraseña permanente (el usuario no tendrá que cambiarla en el primer login)
echo "2️⃣  Ingresa la contraseña permanente para el usuario"
echo "   (mín. 8 caracteres, mayúsculas, minúsculas, números y símbolos)"
read -s -p "   Contraseña: " PERM_PASSWORD
echo ""

aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER_EMAIL" \
  --password "$PERM_PASSWORD" \
  --permanent \
  --region "$REGION"

echo "   ✅ Contraseña establecida"

# Paso 3: Agregar al grupo
echo "3️⃣  Asignando rol '$GROUP_NAME'..."
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER_EMAIL" \
  --group-name "$GROUP_NAME" \
  --region "$REGION"

echo "   ✅ Rol asignado"

# Paso 4: Mostrar resumen
echo ""
echo "=================================================="
echo "  ✅ Usuario creado exitosamente"
echo "=================================================="
echo "  Email:       $USER_EMAIL"
echo "  Rol:         $GROUP_NAME"
echo "  User Pool:   $USER_POOL_ID"
echo ""
echo "  El usuario puede iniciar sesión en:"
echo "  http://localhost:5173"
echo ""
echo "  Para acceder al panel admin:"
echo "  http://localhost:5173/admin"
echo "=================================================="
echo ""
