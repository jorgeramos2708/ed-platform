// edp.exe — lanzador de ED Platform (ADR-0011)
// up (por defecto): si la API ya responde, abre la UI directamente (sin tocar Docker);
//                   si no: Docker OK -> compose up -> espera health -> abre la UI
// build: reconstruye las imágenes (tras cambios de código) · stop: compose down
using System.Diagnostics;

const string Version = "1.3.0";
var modo = args.Length > 0 ? args[0].ToLowerInvariant() : "up";

static void Registrar(string mensaje)
{
    var linea = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {mensaje}";
    Console.WriteLine(linea);
    try { File.AppendAllText(Path.Combine(AppContext.BaseDirectory, "edp-log.txt"), linea + Environment.NewLine); } catch { /* el log no debe romper el lanzador */ }
}

var root = FindRepoRoot(AppContext.BaseDirectory)
    ?? throw new InvalidOperationException("No encuentro docker/compose.dev.yml — coloca edp.exe dentro del árbol del repositorio.");
var composeArgs = $"compose -p edp -f \"{Path.Combine(root, "docker", "compose.dev.yml")}\"";
var urlUI = "http://localhost:3101";
// 127.0.0.1 explícito: 'localhost' puede resolver a ::1 y .NET HttpClient no alcanza el puerto
// publicado de Docker en IPv6 (curl a 127.0.0.1 siempre funcionó — evidencia del incidente del lock)
var healthUrl = "http://127.0.0.1:3100/api/health";
using var http = new HttpClient(new System.Net.Http.HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(2) }; // el proxy del sistema rompe localhost (hallazgo del incidente)

Registrar($"=== edp v{Version} (modo {modo}) ===");
Registrar($"repo: {root}");

// build: reconstruye las imágenes — solo tras cambios de código (lo diario no pasa por aquí)
if (modo == "build")
{
    Run("docker", composeArgs + " build");
    Registrar("imágenes reconstruidas.");
    return;
}

if (modo == "stop")
{
    Run("docker", composeArgs + " down");
    Registrar("stack detenido.");
    return;
}

// PASO 0: si la API ya responde, el stack está arriba — abrir la UI directamente.
// Cero llamadas a Docker: el flujo diario del usuario jamás toca el builder ni el launcher.
try
{
    var respuestaPaso0 = await http.GetAsync(healthUrl);
    if (respuestaPaso0.IsSuccessStatusCode)
    {
        Registrar("la API ya responde — abriendo la UI directamente.");
        Proceso(new ProcessStartInfo(urlUI) { UseShellExecute = true });
        FinalizarConMensaje("Todo listo — la plataforma ya estaba corriendo. Esta ventana puede cerrarse.");
        return;
    }
    Registrar($"paso 0: la API respondió {(int)respuestaPaso0.StatusCode} — seguimos con el arranque completo");
}
catch (Exception e)
{
    Registrar($"paso 0: la API no responde aún ({e.InnerException?.Message ?? e.Message}) — seguimos con el arranque completo");
}

// 1) Docker disponible — SIN lanzar segundas instancias (el launcher.lock se rechaza si otra vive)
if (!DockerOk())
{
    if (BackendCorriendo())
    {
        Registrar("Docker Desktop ya se está ejecutando — esperando al engine...");
    }
    else
    {
        Registrar("Docker no responde — arrancando Docker Desktop...");
        var dd = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Docker", "Docker", "Docker Desktop.exe");
        if (File.Exists(dd))
            Proceso(new ProcessStartInfo(dd) { UseShellExecute = true });
        else
            Registrar("Docker Desktop no está en la ruta habitual — ábrelo manualmente.");
    }
    Registrar("esperando a Docker (el arranque en frío puede tardar ~2-4 min)...");
    if (!await Esperar(DockerOk, TimeSpan.FromSeconds(300)))
    {
        Registrar("FALLO: Docker Desktop no quedó operativo a tiempo.");
        Registrar("Si viste 'launcher.lock: Access is denied': cierra TODAS las instancias desde la bandeja (Troubleshoot → Restart Docker Desktop) y reintenta.");
        Environment.Exit(1);
    }
}
Registrar("Docker OK.");

// 2) Levantar el stack SIN rebuild (rápido y sin tocar el builder)
Run("docker", composeArgs + " up -d");

// 3) Esperar salud: comando terminado != aplicación saludable (CONSTRAINTS §1.5)
Registrar($"esperando salud en {healthUrl} ...");
if (!await EsperarSalud(healthUrl, TimeSpan.FromSeconds(240)))
{
    Registrar("FALLO: la API no llegó a salud a tiempo — revisa: docker compose -p edp logs");
    Environment.Exit(1);
}
Registrar("API saludable.");

// 4) Abrir la UI web
Registrar($"ED Platform arriba: {urlUI}");
Proceso(new ProcessStartInfo(urlUI) { UseShellExecute = true });
FinalizarConMensaje("Todo listo — la plataforma sigue corriendo en segundo plano aunque cierre esta ventana. Para detenerla: edp.exe stop");

static bool DockerOk()
{
    try
    {
        var p = Process.Start(new ProcessStartInfo("docker", "info -f \"{{.ServerVersion}}\"")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        });
        var salida = p!.StandardOutput.ReadToEnd(); // leer antes de esperar: un pipe lleno sin lector bloquea
        p.WaitForExit(15000);
        return p.HasExited && p.ExitCode == 0 && salida.Trim().Length > 0;
    }
    catch { return false; }
}

// El backend de Docker Desktop vive aunque la GUI se cierre: si existe, NUNCA lanzar otra instancia
static bool BackendCorriendo() => Process.GetProcessesByName("com.docker.backend").Length > 0;

// El doble-cierto cierre instantáneo de la consola despista: mensaje final visible hasta que el usuario cierre
static void FinalizarConMensaje(string mensaje)
{
    Console.WriteLine();
    Console.WriteLine($"[edp] {mensaje}");
    Console.Write("[edp] pulsa cualquier tecla para cerrar esta ventana...");
    try { Console.ReadKey(true); } catch { /* sin consola interactiva (ejecución desde terminal) */ }
}

static void Proceso(ProcessStartInfo info) => Process.Start(info);

static void Run(string exe, string args)
{
    var p = Process.Start(new ProcessStartInfo(exe, args)
    {
        RedirectStandardError = true,
        UseShellExecute = false,
    });
    var err = p!.StandardError.ReadToEnd();
    p.WaitForExit();
    if (p.ExitCode != 0)
    {
        Registrar($"FALLO del comando: {exe} {args} (exit {p.ExitCode}) stderr: {err.Trim()}");
        Environment.Exit(p.ExitCode);
    }
}

static async Task<bool> Esperar(Func<bool> cond, TimeSpan max)
{
    var fin = DateTime.UtcNow + max;
    while (DateTime.UtcNow < fin)
    {
        if (cond()) { Console.WriteLine(); return true; }
        Console.Write(".");
        await Task.Delay(1000);
    }
    Console.WriteLine();
    return false;
}

static async Task<bool> EsperarSalud(string url, TimeSpan max)
{
    using var http = new HttpClient(new System.Net.Http.HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(3) };
    var fin = DateTime.UtcNow + max;
    while (DateTime.UtcNow < fin)
    {
        try
        {
            if ((await http.GetAsync(url)).IsSuccessStatusCode) return true;
        }
        catch { /* aún no responde */ }
        await Task.Delay(1000);
    }
    return false;
}

static string? FindRepoRoot(string start)
{
    var dir = new DirectoryInfo(start);
    for (var i = 0; i < 8 && dir is not null; i++, dir = dir.Parent!)
        if (File.Exists(Path.Combine(dir.FullName, "docker", "compose.dev.yml")))
            return dir.FullName;
    return null;
}
