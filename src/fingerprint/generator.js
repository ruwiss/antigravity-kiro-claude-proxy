import crypto from 'crypto';
import os from 'os';

const OS_VERSIONS = {
    darwin: ['10.15.7', '11.6.8', '12.6.3', '13.5.2', '14.2.1', '14.5'],
    win32: ['10.0.19041', '10.0.19042', '10.0.19043', '10.0.22000', '10.0.22621', '10.0.22631'],
    linux: ['5.15.0', '5.19.0', '6.1.0', '6.2.0', '6.5.0', '6.6.0']
};

const ARCHITECTURES = ['x64', 'arm64'];

const ANTIGRAVITY_VERSIONS = ['1.10.0', '1.10.5', '1.11.0', '1.11.2', '1.11.5', '1.12.0', '1.12.1'];

const IDE_TYPES = [
    'IDE_UNSPECIFIED',
    'VSCODE',
    'INTELLIJ',
    'ANDROID_STUDIO',
    'CLOUD_SHELL_EDITOR'
];

const PLATFORMS = [
    'PLATFORM_UNSPECIFIED',
    'WINDOWS',
    'MACOS',
    'LINUX'
];

const SDK_CLIENTS = [
    'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'google-cloud-sdk vscode/1.86.0',
    'google-cloud-sdk vscode/1.87.0',
    'google-cloud-sdk intellij/2024.1',
    'google-cloud-sdk android-studio/2024.1',
    'gcloud-python/1.2.0 grpc-google-iam-v1/0.12.6'
];

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateDeviceId() {
    return crypto.randomUUID();
}

function generateSessionToken() {
    return crypto.randomBytes(16).toString('hex');
}

export function generateFingerprint() {
    const platform = randomFrom(['darwin', 'win32', 'linux']);
    const arch = randomFrom(ARCHITECTURES);
    const osVersion = randomFrom(OS_VERSIONS[platform]);
    const antigravityVersion = randomFrom(ANTIGRAVITY_VERSIONS);

    const matchingPlatform = platform === 'darwin' ? 'MACOS'
        : platform === 'win32' ? 'WINDOWS'
        : platform === 'linux' ? 'LINUX'
        : randomFrom(PLATFORMS);

    return {
        deviceId: generateDeviceId(),
        sessionToken: generateSessionToken(),
        userAgent: `antigravity/${antigravityVersion} ${platform}/${arch}`,
        apiClient: randomFrom(SDK_CLIENTS),
        clientMetadata: {
            ideType: randomFrom(IDE_TYPES),
            platform: matchingPlatform,
            pluginType: 'GEMINI',
            osVersion: osVersion,
            arch: arch
        },
        quotaUser: `device-${crypto.randomBytes(8).toString('hex')}`,
        createdAt: Date.now()
    };
}

export function collectCurrentFingerprint() {
    const platform = os.platform();
    const arch = os.arch();
    const osRelease = os.release();

    const matchingPlatform = platform === 'darwin' ? 'MACOS'
        : platform === 'win32' ? 'WINDOWS'
        : platform === 'linux' ? 'LINUX'
        : 'PLATFORM_UNSPECIFIED';

    return {
        deviceId: generateDeviceId(),
        sessionToken: generateSessionToken(),
        userAgent: `antigravity/1.11.5 ${platform}/${arch}`,
        apiClient: 'google-cloud-sdk vscode_cloudshelleditor/0.1',
        clientMetadata: {
            ideType: 'VSCODE',
            platform: matchingPlatform,
            pluginType: 'GEMINI',
            osVersion: osRelease,
            arch: arch
        },
        quotaUser: `device-${crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 16)}`,
        createdAt: Date.now()
    };
}

export function buildFingerprintHeaders(fingerprint) {
    if (!fingerprint) {
        return {};
    }

    return {
        'User-Agent': fingerprint.userAgent,
        'X-Goog-Api-Client': fingerprint.apiClient,
        'Client-Metadata': JSON.stringify(fingerprint.clientMetadata),
        'X-Goog-QuotaUser': fingerprint.quotaUser,
        'X-Client-Device-Id': fingerprint.deviceId
    };
}
