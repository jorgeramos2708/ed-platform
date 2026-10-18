# Fixture SSH persistente para los tests de Fase 4 (sshd auténtico en contenedor).
# Uso: pwsh levantar-sshd.ps1  → imprime "PUERTO|RUTA_CLAVE_PRIVADA"
# Idempotente: reutiliza el par de claves persistido y reinicia el contenedor si hace falta.
param([string]$Puerto = '2299')
$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot '.fixture-sshd'
New-Item -ItemType Directory -Force $dir | Out-Null
$priv = Join-Path $dir 'id_ed25519'
$pub = Join-Path $dir 'id_ed25519.pub'

# par de claves persistente (passphrase vacía — fixture de pruebas, gitignored)
if (-not (Test-Path $priv)) {
  cmd /c "ssh-keygen -t ed25519 -f `"$priv`" -N `"`" -q" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'ssh-keygen falló' }
}

# contenedor: recrear si no está corriendo
$corriendo = docker ps --filter name=edp-sshd-fixture --format '{{.Names}}'
if (-not $corriendo) {
  docker rm -f edp-sshd-fixture 2>$null | Out-Null
  $pubContenido = (Get-Content $pub -Raw).Trim()
  docker run -d --name edp-sshd-fixture -p "127.0.0.1:${Puerto}:2222" `
    -e PUID=1000 -e PGID=1000 -e USER_NAME=spike `
    -e "PUBLIC_KEY=$pubContenido" -e PASSWORD_ACCESS=false `
    lscr.io/linuxserver/openssh-server:latest | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'docker run del sshd fixture falló' }
} else {
  Write-Output "fixture ya corriendo (puerto $Puerto)"
}

# espera del banner SSH real (hasta 30 s)
$listo = $false
for ($i = 0; $i -lt 20 -and -not $listo; $i++) {
  Start-Sleep -Seconds 2
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', [int]$Puerto)
    $s = $c.GetStream()
    $s.ReadTimeout = 3000
    $buf = New-Object byte[] 64
    $n = $s.Read($buf, 0, 64)
    $c.Close()
    if ([Text.Encoding]::UTF8.GetString($buf, 0, $n) -match 'SSH-') { $listo = $true }
  } catch { }
}
if (-not $listo) { throw 'el sshd fixture no respondió con banner en 40s' }

Write-Output "$Puerto|$priv"
