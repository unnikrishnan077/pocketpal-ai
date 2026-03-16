import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import NativeHardwareInfo from '../specs/NativeHardwareInfo';
import {
  checkGpuSupport,
  getCpuInfo,
  getCpuCoreCount,
  getRecommendedThreadCount,
  isHighEndDevice,
  getGpuInfo,
  getChipsetInfo,
} from '../deviceCapabilities';

describe('deviceCapabilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkGpuSupport', () => {
    it('should return unsupported for simulator', async () => {
      (DeviceInfo.isEmulator as jest.Mock).mockResolvedValue(true);
      const result = await checkGpuSupport();
      expect(result.isSupported).toBe(false);
      expect(result.reason).toBe('simulator');
      expect(result.details?.isSimulator).toBe(true);
    });

    it('should return supported for iOS 18+', async () => {
      (DeviceInfo.isEmulator as jest.Mock).mockResolvedValue(false);
      Platform.OS = 'ios';
      Platform.Version = '18';
      const result = await checkGpuSupport();
      expect(result.isSupported).toBe(true);
      expect(result.details?.iosVersion).toBe(18);
    });

    it('should return unsupported for iOS < 18', async () => {
      (DeviceInfo.isEmulator as jest.Mock).mockResolvedValue(false);
      Platform.OS = 'ios';
      Platform.Version = '17';
      const result = await checkGpuSupport();
      expect(result.isSupported).toBe(false);
      expect(result.reason).toBe('ios_version');
      expect(result.details?.iosVersion).toBe(17);
    });

    it('should return supported for Android with Adreno and CPU features (relaxed)', async () => {
      (DeviceInfo.isEmulator as jest.Mock).mockResolvedValue(false);
      Platform.OS = 'android';
      (NativeHardwareInfo.getGPUInfo as jest.Mock).mockResolvedValue({hasAdreno: true});
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({hasI8mm: true, hasDotProd: false});
      
      const result = await checkGpuSupport();
      expect(result.isSupported).toBe(true);
      expect(result.details?.hasAdreno).toBe(true);
    });

    it('should return unsupported for Android without Adreno', async () => {
      (DeviceInfo.isEmulator as jest.Mock).mockResolvedValue(false);
      Platform.OS = 'android';
      (NativeHardwareInfo.getGPUInfo as jest.Mock).mockResolvedValue({hasAdreno: false});
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({hasI8mm: true, hasDotProd: true});
      
      const result = await checkGpuSupport();
      expect(result.isSupported).toBe(false);
      expect(result.reason).toBe('no_adreno');
    });

    it('should return unsupported for Android with Adreno but missing CPU features', async () => {
      (DeviceInfo.isEmulator as jest.Mock).mockResolvedValue(false);
      Platform.OS = 'android';
      (NativeHardwareInfo.getGPUInfo as jest.Mock).mockResolvedValue({hasAdreno: true});
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({hasI8mm: false, hasDotProd: false});
      
      const result = await checkGpuSupport();
      expect(result.isSupported).toBe(false);
      expect(result.reason).toBe('missing_cpu_features');
    });

    it('should handle errors gracefully', async () => {
      (DeviceInfo.isEmulator as jest.Mock).mockResolvedValue(false);
      Platform.OS = 'android';
      (NativeHardwareInfo.getGPUInfo as jest.Mock).mockRejectedValue(new Error('Native error'));
      
      const result = await checkGpuSupport();
      expect(result.isSupported).toBe(false);
      expect(result.reason).toBe('unknown');
    });
  });

  describe('getCpuInfo', () => {
    it('should return mapped CPU info on Android', async () => {
      Platform.OS = 'android';
      const mockInfo = {
        cores: 8,
        processors: [{processor: '0', 'model name': 'Cortex-A78', 'cpu MHz': '2400', vendor_id: 'ARM'}],
        socModel: 'SM8350',
        features: ['fp', 'asimd'],
        hasFp16: true,
        hasDotProd: true,
        hasSve: false,
        hasI8mm: true,
      };
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue(mockInfo);
      
      const info = await getCpuInfo();
      expect(info?.cores).toBe(8);
      expect(info?.socModel).toBe('SM8350');
      expect(info?.processors?.[0]?.processor).toBe('0');
      expect(info?.hasFp16).toBe(true);
    });

    it('should return minimal info on iOS', async () => {
      Platform.OS = 'ios';
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 6 });
      
      const info = await getCpuInfo();
      expect(info?.cores).toBe(6);
      expect(info?.processors).toHaveLength(0);
      expect(info?.features).toHaveLength(0);
    });

    it('should return null on error', async () => {
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockRejectedValue(new Error('error'));
      const info = await getCpuInfo();
      expect(info).toBeNull();
    });
  });

  describe('getCpuCoreCount', () => {
    it('should return cores from getCpuInfo', async () => {
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 8 });
      const count = await getCpuCoreCount();
      expect(count).toBe(8);
    });

    it('should default to 4 if getCpuInfo returns null', async () => {
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue(null);
      const count = await getCpuCoreCount();
      expect(count).toBe(4);
    });
  });

  describe('getRecommendedThreadCount', () => {
    it('should return all cores for <= 4 cores', async () => {
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 4 });
      const count = await getRecommendedThreadCount();
      expect(count).toBe(4);
    });

    it('should return 80% of cores for > 4 cores', async () => {
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 10 });
      const count = await getRecommendedThreadCount();
      expect(count).toBe(8);
    });

    it('should return 6 for Snapdragon 8 Elite (SM8750)', async () => {
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 8, socModel: 'SM8750' });
      const count = await getRecommendedThreadCount();
      expect(count).toBe(6);
    });

    it('should return 6 for Snapdragon 8 Elite (text name)', async () => {
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 8, socModel: 'Snapdragon 8 Elite' });
      const count = await getRecommendedThreadCount();
      expect(count).toBe(6);
    });
  });

  describe('isHighEndDevice', () => {
    it('should return true if RAM >= 5.5GB and cores >= 6', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6 * 1024 * 1024 * 1024); // 6GB
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 6 });
      const result = await isHighEndDevice();
      expect(result).toBe(true);
    });

    it('should return false if RAM < 5.5GB', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(4 * 1024 * 1024 * 1024); // 4GB
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 8 });
      const result = await isHighEndDevice();
      expect(result).toBe(false);
    });

    it('should return false if cores < 6', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8 * 1024 * 1024 * 1024); // 8GB
      (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({ cores: 4 });
      const result = await isHighEndDevice();
      expect(result).toBe(false);
    });

    it('should handle errors returning false', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await isHighEndDevice();
      expect(result).toBe(false);
    });
  });

  describe('getGpuInfo', () => {
    it('should return GPU info from native module', async () => {
      const mockGPU = {renderer: 'Adreno 740'};
      (NativeHardwareInfo.getGPUInfo as jest.Mock).mockResolvedValue(mockGPU);
      const info = await getGpuInfo();
      expect(info).toEqual(mockGPU);
    });

    it('should return null on error', async () => {
      (NativeHardwareInfo.getGPUInfo as jest.Mock).mockRejectedValue(new Error('fail'));
      const info = await getGpuInfo();
      expect(info).toBeNull();
    });
  });

  describe('getChipsetInfo', () => {
    it('should return null on iOS', async () => {
      Platform.OS = 'ios';
      const info = await getChipsetInfo();
      expect(info).toBeNull();
    });

    it('should return chipset info on Android', async () => {
      Platform.OS = 'android';
      (NativeHardwareInfo.getChipset as jest.Mock).mockResolvedValue('Snapdragon 8 Gen 2');
      const info = await getChipsetInfo();
      expect(info).toBe('Snapdragon 8 Gen 2');
    });
  });
});
