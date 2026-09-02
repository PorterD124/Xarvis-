/**
 * Service for interacting with Lovense devices via Web Bluetooth.
 */

export type LovenseCommand = 'Vibrate' | 'Rotate' | 'Pump' | 'Stop';

export class LovenseService {
  private isConnected = false;
  private bluetoothDevice: any = null;
  private bluetoothCharacteristic: any = null;

  // Lovense Bluetooth UUIDs
  private static SERVICE_UUIDS = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Newer models
    '0000fff0-0000-1000-8000-00805f9b34fb'  // Older models
  ];
  private static TX_UUIDS = [
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    '0000fff1-0000-1000-8000-00805f9b34fb'
  ];

  /**
   * Attempt to connect via Web Bluetooth
   */
  async connect(): Promise<boolean> {
    try {
      // Check if Bluetooth is supported
      if (!(navigator as any).bluetooth) {
        throw new Error("Web Bluetooth is not supported in this browser.");
      }

      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: 'LVS-' }, 
          { namePrefix: 'Lovense' },
          { namePrefix: 'LS' }
        ],
        optionalServices: LovenseService.SERVICE_UUIDS
      });

      if (!device) throw new Error("Bluetooth connection cancelled");

      const server = await device.gatt.connect();
      
      // Try to find the primary service from our list
      let service;
      let txUuid;
      
      for (let i = 0; i < LovenseService.SERVICE_UUIDS.length; i++) {
        try {
          service = await server.getPrimaryService(LovenseService.SERVICE_UUIDS[i]);
          txUuid = LovenseService.TX_UUIDS[i];
          if (service) break;
        } catch (e) {
          continue;
        }
      }

      if (!service || !txUuid) throw new Error("Could not find compatible Lovense service");

      this.bluetoothCharacteristic = await service.getCharacteristic(txUuid);
      this.bluetoothDevice = device;
      this.isConnected = true;

      device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        this.bluetoothDevice = null;
        this.bluetoothCharacteristic = null;
        console.log("[Lovense] Bluetooth disconnected");
      });

      console.log("[Lovense] Bluetooth connected to:", device.name);
      return true;
    } catch (err) {
      console.error("[Lovense] Bluetooth connection failed:", err);
      throw err;
    }
  }

  /**
   * Send a command to the device
   * @param command The command type
   * @param level Intensity level (0-20)
   */
  async sendCommand(command: LovenseCommand, level: number = 0) {
    if (!this.isConnected || !this.bluetoothCharacteristic) return;

    // Normalize level to 0-20 (Lovense standard)
    const normalizedLevel = Math.max(0, Math.min(20, Math.round(level)));

    try {
      const encoder = new TextEncoder();
      // Lovense Bluetooth protocol: "Vibrate:10;"
      await this.bluetoothCharacteristic.writeValue(encoder.encode(`${command}:${normalizedLevel};`));
    } catch (err) {
      console.error("[Lovense] Bluetooth command failed:", err);
    }
  }

  async stop() {
    await this.sendCommand('Stop', 0);
  }

  getIsConnected() {
    return this.isConnected;
  }
}

export const lovenseService = new LovenseService();
