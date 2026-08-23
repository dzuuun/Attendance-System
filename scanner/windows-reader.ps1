$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public sealed class ScannerInputWindow : NativeWindow {
    const int WM_INPUT = 0x00FF;
    const uint RID_INPUT = 0x10000003;
    const uint RIDI_DEVICENAME = 0x20000007;
    const uint RIDEV_INPUTSINK = 0x00000100;
    const uint RIM_TYPEKEYBOARD = 1;
    readonly Dictionary<IntPtr, StringBuilder> buffers = new Dictionary<IntPtr, StringBuilder>();
    readonly HashSet<IntPtr> shifted = new HashSet<IntPtr>();

    [StructLayout(LayoutKind.Sequential)] struct RAWINPUTDEVICE {
        public ushort usagePage, usage;
        public uint flags;
        public IntPtr target;
    }
    [StructLayout(LayoutKind.Sequential)] struct RAWINPUTHEADER {
        public uint type, size;
        public IntPtr device, wParam;
    }
    [StructLayout(LayoutKind.Sequential)] struct RAWKEYBOARD {
        public ushort makeCode, flags, reserved, vKey;
        public uint message, extraInformation;
    }
    [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint count, uint size);
    [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr input, uint command, IntPtr data, ref uint size, uint headerSize);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, StringBuilder data, ref uint size);

    public ScannerInputWindow() {
        CreateHandle(new CreateParams());
        var devices = new [] { new RAWINPUTDEVICE { usagePage=1, usage=6, flags=RIDEV_INPUTSINK, target=Handle } };
        if (!RegisterRawInputDevices(devices, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }

    protected override void WndProc(ref Message message) {
        if (message.Msg == WM_INPUT) ReadInput(message.LParam);
        base.WndProc(ref message);
    }

    void ReadInput(IntPtr input) {
        uint size = 0, headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
        GetRawInputData(input, RID_INPUT, IntPtr.Zero, ref size, headerSize);
        if (size == 0) return;
        IntPtr memory = Marshal.AllocHGlobal((int)size);
        try {
            if (GetRawInputData(input, RID_INPUT, memory, ref size, headerSize) != size) return;
            var header = (RAWINPUTHEADER)Marshal.PtrToStructure(memory, typeof(RAWINPUTHEADER));
            if (header.type != RIM_TYPEKEYBOARD) return;
            var keyboard = (RAWKEYBOARD)Marshal.PtrToStructure(IntPtr.Add(memory, Marshal.SizeOf(typeof(RAWINPUTHEADER))), typeof(RAWKEYBOARD));
            bool down = keyboard.message == 0x0100 || keyboard.message == 0x0104;
            if (keyboard.vKey == 16) {
                if (down) shifted.Add(header.device); else shifted.Remove(header.device);
                return;
            }
            if (!down) return;
            if (!buffers.ContainsKey(header.device)) buffers[header.device] = new StringBuilder();
            if (keyboard.vKey == 13) {
                string value = buffers[header.device].ToString();
                buffers[header.device].Clear();
                if (value.Length > 0) Emit(header.device, value);
                return;
            }
            char character = Translate(keyboard.vKey, shifted.Contains(header.device));
            if (character != '\0') buffers[header.device].Append(character);
        } finally { Marshal.FreeHGlobal(memory); }
    }

    static char Translate(ushort key, bool shift) {
        if (key >= 65 && key <= 90) return shift ? (char)key : Char.ToLowerInvariant((char)key);
        if (key >= 48 && key <= 57) return (char)key;
        if (key >= 96 && key <= 105) return (char)('0' + key - 96);
        if (key == 189 || key == 109) return '-';
        if (key == 32) return ' ';
        return '\0';
    }

    static string DeviceName(IntPtr device) {
        uint length = 0;
        GetRawInputDeviceInfo(device, RIDI_DEVICENAME, null, ref length);
        var name = new StringBuilder((int)length + 1);
        GetRawInputDeviceInfo(device, RIDI_DEVICENAME, name, ref length);
        return name.ToString();
    }
    static string Escape(string value) { return value.Replace("\\", "\\\\").Replace("\"", "\\\""); }
    static void Emit(IntPtr device, string value) {
        string name = DeviceName(device);
        Console.WriteLine("{\"deviceId\":\"" + Escape(name) + "\",\"name\":\"" + Escape(name) + "\",\"value\":\"" + Escape(value) + "\"}");
        Console.Out.Flush();
    }
}

public static class ScannerReader {
    [STAThread] public static void Run() {
        var window = new ScannerInputWindow();
        Application.Run();
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms
[ScannerReader]::Run()
