using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
[assembly: AssemblyTitle("CardioAhead Collector")]
[assembly: AssemblyDescription("Patient-controlled Clalit record collector")]
[assembly: AssemblyCompany("CardioAhead")]
[assembly: AssemblyProduct("CardioAhead Collector")]
[assembly: AssemblyVersion("0.4.0.0")]
[assembly: AssemblyFileVersion("0.4.0.0")]

internal sealed class PackageManifest { public string version { get; set; } public PackageFile[] files { get; set; } }
internal sealed class PackageFile { public string path { get; set; } public long bytes { get; set; } public string sha256 { get; set; } }
internal sealed class SessionMarker {
    public int schema { get; set; }
    public string app { get; set; }
    public string created_at { get; set; }
    public string expires_at { get; set; }
    public int process_id { get; set; }
    public long process_started_ticks { get; set; }
}
internal static class CollectorLauncher {
    const string PayloadHash = "__PAYLOAD_SHA256__";
    const string ManifestHash = "__MANIFEST_SHA256__";
    const string Version = "0.4.0";
    const string LocalHome = "http://127.0.0.1:3184/connect";
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static string Hash(Stream stream) { using (var algorithm = SHA256.Create()) return BitConverter.ToString(algorithm.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
    static string FileHash(string filename) { using (var stream = File.OpenRead(filename)) return Hash(stream); }
    static string Contained(string root, string relative) {
        if (String.IsNullOrEmpty(relative) || Path.IsPathRooted(relative) || relative.Contains(":") || relative.Contains("\\")) throw new InvalidDataException("INVALID_PACKAGE_PATH");
        string target = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        string prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("PACKAGE_PATH_OUTSIDE_ROOT");
        return target;
    }
    static void RejectReparsePoints(string directory) {
        string full = Path.GetFullPath(directory);
        for (var current = new DirectoryInfo(full); current != null; current = current.Parent)
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("LINKED_PACKAGE_DIRECTORY");
    }
    static PackageManifest Verify(string root) {
        RejectReparsePoints(root);
        string manifestPath = Contained(root, "manifest.json");
        if (FileHash(manifestPath) != ManifestHash) throw new InvalidDataException("PACKAGE_MANIFEST_CHANGED");
        var manifest = Json.Deserialize<PackageManifest>(File.ReadAllText(manifestPath));
        if (manifest == null || manifest.version != Version || manifest.files == null || manifest.files.Length < 3 || manifest.files.Length > 500) throw new InvalidDataException("INVALID_MANIFEST");
        var expected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        expected.Add(Path.GetFullPath(manifestPath));
        foreach (var file in manifest.files) {
            string target = Contained(root, file.path);
            RejectReparsePoints(Path.GetDirectoryName(target));
            if (!expected.Add(target) || !File.Exists(target) || (File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0 || new FileInfo(target).Length != file.bytes || FileHash(target) != file.sha256) throw new InvalidDataException("PACKAGE_FILE_CHANGED");
        }
        foreach (string file in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
            if (!expected.Contains(Path.GetFullPath(file))) throw new InvalidDataException("UNEXPECTED_PACKAGE_FILE");
        return manifest;
    }
    static string Prepare(string parent) {
        RejectReparsePoints(parent);
        Directory.CreateDirectory(parent);
        string destination = Path.Combine(parent, "v" + Version + "-" + PayloadHash.Substring(0, 12));
        if (Directory.Exists(destination)) { Verify(destination); return destination; }
        string staging = Path.Combine(parent, "preparing-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(staging);
        // Extract only embedded application binaries. No downloaded code, credentials or patient records.
        using (Stream embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream("CardioAhead.Payload.zip")) {
            if (embedded == null || Hash(embedded) != PayloadHash) throw new InvalidDataException("EMBEDDED_PACKAGE_CHANGED");
            embedded.Position = 0;
            using (var archive = new ZipArchive(embedded, ZipArchiveMode.Read, true)) {
                long total = 0;
                foreach (var entry in archive.Entries) {
                    string target = Contained(staging, entry.FullName);
                    if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(target); continue; }
                    total += entry.Length;
                    if (entry.Length > 160 * 1024 * 1024 || total > 400 * 1024 * 1024) throw new InvalidDataException("PACKAGE_SIZE_LIMIT");
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    using (var source = entry.Open()) using (var output = new FileStream(target, FileMode.CreateNew)) source.CopyTo(output);
                }
            }
        }
        Verify(staging);
        Directory.Move(staging, destination);
        return destination;
    }
    static ProcessStartInfo NodeCommand(string root, string arguments) {
        var info = new ProcessStartInfo(Contained(root, "runtime/node.exe"), arguments);
        info.WorkingDirectory = root;
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.WindowStyle = ProcessWindowStyle.Hidden;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        info.EnvironmentVariables.Remove("DEBUG"); info.EnvironmentVariables.Remove("PWDEBUG");
        info.EnvironmentVariables.Remove("NODE_OPTIONS"); info.EnvironmentVariables.Remove("NODE_PATH");
        return info;
    }
    const string SessionMarkerName = ".cardioahead-session.json";
    static string OwnedSession(string parent, string session) {
        string approved = Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar);
        string resolved = Path.GetFullPath(session).TrimEnd(Path.DirectorySeparatorChar);
        if (Path.GetDirectoryName(resolved) != approved || !System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(resolved), "^session-[a-f0-9]{32}$")) throw new InvalidDataException("CLEANUP_SCOPE_DENIED");
        RejectReparsePoints(resolved);
        return resolved;
    }
    static SessionMarker ReadSession(string parent, string session) {
        string root = OwnedSession(parent, session), marker = Path.Combine(root, SessionMarkerName);
        if (!File.Exists(marker) || (File.GetAttributes(marker) & FileAttributes.ReparsePoint) != 0 || new FileInfo(marker).Length > 2048) throw new InvalidDataException("CLEANUP_OWNER_UNKNOWN");
        var data = Json.Deserialize<SessionMarker>(File.ReadAllText(marker));
        DateTime created, expires;
        if (data == null || data.schema != 1 || data.app != "CardioAhead.Collector" || !DateTime.TryParse(data.created_at, out created) || !DateTime.TryParse(data.expires_at, out expires)) throw new InvalidDataException("CLEANUP_OWNER_UNKNOWN");
        return data;
    }
    static void WriteSession(string root, SessionMarker marker) { File.WriteAllText(Path.Combine(root, SessionMarkerName), Json.Serialize(marker)); }
    static string CreateSession(string parent) {
        RejectReparsePoints(parent); Directory.CreateDirectory(parent);
        string root = Path.Combine(parent, "session-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        WriteSession(root, new SessionMarker { schema = 1, app = "CardioAhead.Collector", created_at = DateTime.UtcNow.ToString("o"), expires_at = DateTime.UtcNow.AddMinutes(45).ToString("o") });
        return root;
    }
    static bool SessionProcessAlive(string root, SessionMarker marker) {
        if (marker.process_id <= 0) return false;
        try {
            using (var process = Process.GetProcessById(marker.process_id)) {
                if (process.HasExited || process.StartTime.ToUniversalTime().Ticks != marker.process_started_ticks) return false;
                string module = Path.GetFullPath(process.MainModule.FileName);
                return module.StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
            }
        } catch (ArgumentException) { return false; }
        catch { return true; } // If process ownership cannot be checked, leave the folder intact.
    }
    static void ValidateCleanupTree(string directory, string root) {
        string prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        RejectReparsePoints(directory);
        foreach (string entry in Directory.GetFileSystemEntries(directory)) {
            string full = Path.GetFullPath(entry);
            if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || (File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("UNSAFE_CLEANUP_ENTRY");
            if (Directory.Exists(full)) ValidateCleanupTree(full, root);
        }
    }
    static void DeleteSessionContents(string directory, string root) {
        // All resolved paths were checked inside the explicitly owned session. Never follow links.
        ValidateCleanupTree(directory, root);
        foreach (string child in Directory.GetDirectories(directory)) { DeleteSessionContents(child, root); Directory.Delete(child, false); }
        foreach (string file in Directory.GetFiles(directory)) {
            if (directory == root && Path.GetFileName(file) == SessionMarkerName) continue;
            File.Delete(file);
        }
    }
    static bool CleanupSession(string parent, string session) {
        SessionMarker marker = null; string root = null;
        try {
            root = OwnedSession(parent, session); marker = ReadSession(parent, root);
            if (SessionProcessAlive(root, marker)) return false;
            ValidateCleanupTree(root, root);
            DeleteSessionContents(root, root);
            // Keep the ownership marker until all other files have been removed, so failures are retryable.
            File.Delete(Path.Combine(root, SessionMarkerName));
            Directory.Delete(root, false);
            return true;
        } catch {
            if (root != null && marker != null && Directory.Exists(root)) {
                try { OwnedSession(parent, root); WriteSession(root, marker); } catch { }
            }
            return false;
        }
    }
    static void RecoverAbandonedSessions(string parent) {
        RejectReparsePoints(parent);
        if (!Directory.Exists(parent)) return;
        foreach (string session in Directory.GetDirectories(parent, "session-*")) {
            try { var marker = ReadSession(parent, session); if (!SessionProcessAlive(session, marker)) CleanupSession(parent, session); } catch { }
        }
    }
    static int CleanupSelfTest(string executableDirectory) {
        string parent = Path.Combine(Path.GetTempPath(), "CardioAhead-CollectorCleanupSelfTest");
        Directory.CreateDirectory(parent);
        string sibling = Path.Combine(parent, "unrelated-file.txt"); File.WriteAllText(sibling, "FICTIONAL_OTHER_FILE");
        string session = CreateSession(parent); Directory.CreateDirectory(Path.Combine(session, "temp"));
        File.WriteAllText(Path.Combine(session, "temp", "fixture-cache.txt"), "FICTIONAL_CACHE");
        if (!CleanupSession(parent, session) || Directory.Exists(session) || !File.Exists(sibling)) throw new InvalidDataException("CLEANUP_SCOPE_TEST_FAILED");
        session = CreateSession(parent); string held = Path.Combine(session, "held-file.txt"); File.WriteAllText(held, "FICTIONAL_LOCKED_FILE");
        using (var handle = new FileStream(held, FileMode.Open, FileAccess.Read, FileShare.None)) {
            if (CleanupSession(parent, session) || !File.Exists(Path.Combine(session, SessionMarkerName))) throw new InvalidDataException("CLEANUP_RETRY_TEST_FAILED");
        }
        RecoverAbandonedSessions(parent);
        if (Directory.Exists(session) || !File.Exists(sibling)) throw new InvalidDataException("CLEANUP_RECOVERY_TEST_FAILED");
        string active = CreateSession(parent), activeRoot = Prepare(active);
        using (var process = Process.Start(NodeCommand(activeRoot, "--eval \"setTimeout(() => {}, 10000)\""))) {
            try {
                var owner = ReadSession(parent, active); owner.process_id = process.Id; owner.process_started_ticks = process.StartTime.ToUniversalTime().Ticks; WriteSession(active, owner);
                if (CleanupSession(parent, active) || !Directory.Exists(active)) throw new InvalidDataException("ACTIVE_SESSION_REMOVED");
            } finally { if (!process.HasExited) process.Kill(); process.WaitForExit(); }
        }
        if (!CleanupSession(parent, active)) throw new InvalidDataException("ENDED_SESSION_NOT_REMOVED");
        string unowned = Path.Combine(parent, "session-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(unowned);
        File.WriteAllText(Path.Combine(unowned, "keep.txt"), "FICTIONAL_UNOWNED");
        RecoverAbandonedSessions(parent);
        if (!File.Exists(Path.Combine(unowned, "keep.txt"))) throw new InvalidDataException("UNOWNED_FOLDER_REMOVED");
        File.WriteAllText(Path.Combine(executableDirectory, "cleanup-self-test.json"), Json.Serialize(new Dictionary<string, object> { { "owned_folder_removed", true }, { "active_process_preserved", true }, { "locked_cleanup_retried", true }, { "unowned_files_preserved", true }, { "downloaded_executable_preserved", File.Exists(Assembly.GetExecutingAssembly().Location) } }));
        return 0;
    }
    static int SelfTest(string executableDirectory) {
        string parent = Path.Combine(Path.GetTempPath(), "CardioAhead-CollectorSelfTest");
        string root = Prepare(parent);
        var manifest = Verify(root);
        var result = new Dictionary<string, object>();
        using (var node = Process.Start(NodeCommand(root, "--version"))) {
            string version = node.StandardOutput.ReadToEnd().Trim();
            node.StandardError.ReadToEnd();
            node.WaitForExit();
            if (node.ExitCode != 0 || version != "v24.19.0") throw new InvalidDataException("NODE_RUNTIME_CHECK_FAILED");
            result["runtime"] = version;
        }
        result["version"] = Version; result["files_verified"] = manifest.files.Length; result["payload_directory"] = root;
        result["records_collected"] = 0; result["browser_opened"] = false; result["requires_admin"] = false;
        File.WriteAllText(Path.Combine(executableDirectory, "self-test.json"), Json.Serialize(result));
        return 0;
    }
    [STAThread]
    static int Main(string[] args) {
        bool cleanupTest = args.Length == 1 && args[0] == "--cleanup-self-test";
        bool selfTest = args.Length == 1 && (args[0] == "--self-test" || cleanupTest);
        if (args.Length > 0 && !selfTest) return 2;
        AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling", false);
        AppContext.SetSwitch("Switch.System.IO.BlockLongPaths", false);
        string executableDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        try {
            if (cleanupTest) return CleanupSelfTest(executableDirectory);
            if (selfTest) return SelfTest(executableDirectory);
            bool created;
            string user = System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
            using (var mutex = new Mutex(true, "Local\\CardioAheadCollector-" + user, out created)) {
                if (!created) { Process.Start(new ProcessStartInfo(LocalHome) { UseShellExecute = true }); return 0; }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                string parent = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CardioAhead", "Collector");
                RecoverAbandonedSessions(parent);
                string session = CreateSession(parent);
                try {
                using (var progress = new Form()) {
                    progress.Text = "CardioAhead"; progress.Size = new Size(540, 175); progress.StartPosition = FormStartPosition.CenterScreen;
                    progress.FormBorderStyle = FormBorderStyle.FixedDialog; progress.MaximizeBox = false; progress.MinimizeBox = false; progress.ControlBox = false;
                    progress.BackColor = Color.FromArgb(243, 246, 239);
                    progress.Controls.Add(new Label { Text = "Opening CardioAhead…\nמכינים את CardioAhead לפתיחה", Font = new Font("Segoe UI", 18), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter });
                    progress.Show(); Application.DoEvents();
                    string root = Prepare(session);
                    using (var collector = new Process()) {
                        collector.StartInfo = NodeCommand(root, "\"scripts/clalit-app.mjs\"");
                        string temporary = Path.Combine(session, "temp"); Directory.CreateDirectory(temporary);
                        collector.StartInfo.EnvironmentVariables["TEMP"] = temporary; collector.StartInfo.EnvironmentVariables["TMP"] = temporary;
                        collector.StartInfo.EnvironmentVariables["CARDIOAHEAD_EPHEMERAL_COLLECTOR"] = "1";
                        // Drain and discard child output; never persist browser errors, tokens or medical text.
                        collector.OutputDataReceived += delegate { }; collector.ErrorDataReceived += delegate { };
                        collector.Start();
                        var marker = ReadSession(parent, session); marker.process_id = collector.Id; marker.process_started_ticks = collector.StartTime.ToUniversalTime().Ticks; WriteSession(session, marker);
                        collector.BeginOutputReadLine(); collector.BeginErrorReadLine();
                        Thread.Sleep(600); progress.Close();
                        collector.WaitForExit();
                        if (collector.ExitCode != 0) throw new InvalidOperationException("COLLECTOR_START_FAILED");
                    }
                }
                } finally {
                    if (!CleanupSession(parent, session)) MessageBox.Show("Some working files could not be removed yet. Cleanup will retry when you next open CardioAhead.\\n\\nחלק מקובצי העבודה עדיין בשימוש. הניקוי ינסה שוב בפתיחה הבאה.", "CardioAhead", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                mutex.ReleaseMutex();
            }
            return 0;
        } catch (Exception error) {
            if (selfTest) { string code = System.Text.RegularExpressions.Regex.IsMatch(error.Message, "^[A-Z_]{5,80}$") ? error.Message : error.GetType().Name; File.WriteAllText(Path.Combine(executableDirectory, "self-test.json"), Json.Serialize(new Dictionary<string, object> { { "error", code } })); return 1; }
            MessageBox.Show("CardioAhead could not open. Check that Chrome is installed and close any older collector window before trying again. If this continues, contact the clinic.\n\nלא ניתן לפתוח את CardioAhead. בדקו ש־Chrome מותקן וסגרו אספן קודם. אם הבעיה נמשכת, פנו למרפאה.", "CardioAhead", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }
    }
}