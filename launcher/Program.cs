// edp.exe — lanzador de ED Platform (esqueleto Fase 1, ADR-0011)
// up (por defecto): Docker OK -> compose up -> espera health -> abre la UI
// stop: compose down
using System.Diagnostics;

var modo = args.Length > 0 ? args[0].ToLowerInvariant() : "up";
var root = FindRepoRoot(AppContext.BaseDirectory)
    ?? throw new InvalidOperationException("No encuentro docker/compose.dev.yml — coloca edp.exe dentro del árbol del repositorio.");
var composeArgs = $"compose -p edp -f \"{Path.Combine(root, "docker", "compose.dev.yml")}\"";
var urlUI = "http://localhost:3101"; // la UI web (nginx la sirve; /api se proxea al backend)
var healthUrl = "http://localhost:3100/api/health";

if (modo == "stop")
{
    Run("docker", composeArgs + " down");
    Console.WriteLine("[edp] stack detenido.");
    return;
}

// 1) Docker disponible (arranca Docker Desktop si hace falta)
if (!DockerOk())
{
    Console.WriteLine("[edp] Docker no responde — arrancando Docker Desktop...");
    var dd = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "Docker", "Docker", "Docker Desktop.exe");
    if (!File.Exists(dd))
        Console.WriteLine("[edp] Docker Desktop no está en la ruta habitual — instálalo o ábrelo manualmente.");
    else
        Process.Start(new ProcessStartInfo(dd) { UseShellExecute = true });
    Console.WriteLine("[edp] esperando a Docker (el arranque en frío puede tardar ~2-4 min)...");
    if (!await Esperar(DockerOk, TimeSpan.FromSeconds(240)))
    {
        Console.Error.WriteLine("[edp] Docker Desktop no quedó operativo a tiempo — ábrelo manualmente y reintenta.");
        Environment.Exit(1);
    }
}
Console.WriteLine("[edp] Docker OK.");

// 2) Levantar el stack (recompila la imagen de la API — validación por cambio)
Run("docker", composeArgs + " up -d --build");

// 3) Esperar salud: comando terminado != aplicación saludable (CONSTRAINTS §1.5)
Console.WriteLine($"[edp] esperando salud en {healthUrl} ...");
if (!await EsperarSalud(healthUrl, TimeSpan.FromSeconds(240)))
{
    Console.Error.WriteLine("[edp] la API no llegó a salud a tiempo — revisa: docker compose -p edp logs");
    Environment.Exit(1);
}
Console.WriteLine("[edp] API saludable.");

// 4) Abrir la UI web (login → proyectos)
Console.WriteLine($"[edp] ED Platform arriba: {urlUI} (API: {healthUrl})");
Process.Start(new ProcessStartInfo(urlUI) { UseShellExecute = true });

// NOTA (hallazgo de entorno): bajo el sandbox del agente, los procesos nietos reciben
// "permission denied" al abrir el named pipe de Docker (frontera documentada de DSH).
// Fuera del sandbox (doble clic del usuario) funciona: el daemon y la ruta compose son válidos.
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
        var salida = p!.StandardOutput.ReadToEnd(); // leer antes de esperar: un pipe lleno sin lector bloquea el proceso
        p.WaitForExit(15000);
        return p.HasExited && p.ExitCode == 0 && salida.Trim().Length > 0;
    }
    catch { return false; }
}

static void Run(string exe, string args)
{
    var p = Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false });
    p!.WaitForExit();
    if (p.ExitCode != 0) Environment.Exit(p.ExitCode);
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
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
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
