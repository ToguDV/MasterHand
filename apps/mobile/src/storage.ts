import * as SecureStore from "expo-secure-store"

export interface StoredDevice {
  id: string
  name: string
}

const SERVER_URL_KEY = "masterhand.serverUrl"
const TOKEN_KEY = "masterhand.token"
const DEVICE_KEY = "masterhand.device"

export function loadServerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(SERVER_URL_KEY)
}

export function saveServerUrl(url: string): Promise<void> {
  return SecureStore.setItemAsync(SERVER_URL_KEY, url)
}

export function loadToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export function saveToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token)
}

export function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY)
}

export async function loadDevice(): Promise<StoredDevice | null> {
  const raw = await SecureStore.getItemAsync(DEVICE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredDevice
  } catch {
    return null
  }
}

export function saveDevice(device: StoredDevice): Promise<void> {
  return SecureStore.setItemAsync(DEVICE_KEY, JSON.stringify(device))
}

export function clearDevice(): Promise<void> {
  return SecureStore.deleteItemAsync(DEVICE_KEY)
}
