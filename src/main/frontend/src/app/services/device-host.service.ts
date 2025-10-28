import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

declare global {
  interface Window {
    ARGUS_DEVICE_HOST?: string;
  }
}

@Injectable({
  providedIn: 'root',
})
export class DeviceHostService {
  private readonly storageKey = 'argus.device.hosts';
  private readonly activeHostKey = 'argus.device.host.active';
  private readonly defaultHost = 'http://192.168.178.164:5000';

  private readonly hostsSubject: BehaviorSubject<string[]>;
  readonly hosts$: Observable<string[]>;

  private readonly baseUrlSubject: BehaviorSubject<string>;
  readonly baseUrl$: Observable<string>;

  constructor() {
    const normalizedDefault = this.normalizeHost(this.resolveInitialBaseUrl()) ?? this.defaultHost;
    const storedHosts = this.loadHosts();
    const uniqueHosts = this.deduplicateHosts([normalizedDefault, ...storedHosts]);

    this.hostsSubject = new BehaviorSubject<string[]>(uniqueHosts);
    this.hosts$ = this.hostsSubject.asObservable();

    const initialBase = this.resolveInitialActiveHost(uniqueHosts, normalizedDefault);
    this.baseUrlSubject = new BehaviorSubject<string>(initialBase);
    this.baseUrl$ = this.baseUrlSubject.asObservable();

    this.persistHosts(uniqueHosts);
    this.persistActiveHost(initialBase);
    this.syncGlobalHost(initialBase);
  }

  get currentBaseUrl(): string {
    return this.baseUrlSubject.value;
  }

  get currentHosts(): string[] {
    return this.hostsSubject.value;
  }

  addHost(input: string): void {
    const normalized = this.normalizeHost(input);
    if (!normalized) {
      return;
    }

    const nextHosts = this.deduplicateHosts([...this.hostsSubject.value, normalized]);
    this.hostsSubject.next(nextHosts);
    this.persistHosts(nextHosts);
    this.setActiveHost(normalized);
  }

  removeHost(host: string | null | undefined): void {
    if (!host) {
      return;
    }
    const normalized = this.normalizeHost(host);
    if (!normalized) {
      return;
    }

    const filtered = this.hostsSubject.value.filter(existing => existing !== normalized);
    if (filtered.length === this.hostsSubject.value.length) {
      return;
    }

    const fallback = this.normalizeHost(this.defaultHost) ?? this.defaultHost;
    const nextHosts = filtered.length ? filtered : [fallback];
    this.hostsSubject.next(nextHosts);
    this.persistHosts(nextHosts);

    if (!nextHosts.includes(this.baseUrlSubject.value)) {
      this.setActiveHost(nextHosts[0]);
    }
  }

  setActiveHost(host: string): void {
    const normalized = this.normalizeHost(host);
    if (!normalized) {
      return;
    }

    if (!this.hostsSubject.value.includes(normalized)) {
      const nextHosts = this.deduplicateHosts([...this.hostsSubject.value, normalized]);
      this.hostsSubject.next(nextHosts);
      this.persistHosts(nextHosts);
    }

    if (this.baseUrlSubject.value === normalized) {
      return;
    }

    this.baseUrlSubject.next(normalized);
    this.persistActiveHost(normalized);
    this.syncGlobalHost(normalized);
  }

  trackHost(_index: number, host: string): string {
    return host;
  }

  private loadHosts(): string[] {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map(entry => (typeof entry === 'string' ? this.normalizeHost(entry) : null))
        .filter((entry): entry is string => !!entry);
    } catch {
      return [];
    }
  }

  private resolveInitialActiveHost(candidates: string[], fallback: string): string {
    const stored = this.loadActiveHost();
    if (stored && candidates.includes(stored)) {
      return stored;
    }
    return candidates.includes(fallback) ? fallback : candidates[0] ?? fallback;
  }

  private loadActiveHost(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(this.activeHostKey);
      if (!raw) {
        return null;
      }
      return this.normalizeHost(raw);
    } catch {
      return null;
    }
  }

  private persistHosts(hosts: string[]): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(hosts));
    } catch {
      // ignore storage errors
    }
  }

  private persistActiveHost(host: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(this.activeHostKey, host);
    } catch {
      // ignore storage errors
    }
  }

  private syncGlobalHost(host: string): void {
    if (typeof window !== 'undefined') {
      window.ARGUS_DEVICE_HOST = host;
    }
  }

  private deduplicateHosts(hosts: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const candidate of hosts) {
      if (!candidate || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      result.push(candidate);
    }
    return result;
  }

  private normalizeHost(input: string): string | null {
    if (!input) {
      return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('/')) {
      const sanitized = '/' + trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
      return sanitized === '/' ? '/' : sanitized;
    }

    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmed);
    const candidate = hasProtocol ? trimmed : `http://${trimmed}`;

    try {
      const url = new URL(candidate);
      url.hash = '';
      url.search = '';
      const normalizedPath = url.pathname.replace(/\/+$/, '');
      const path = normalizedPath && normalizedPath !== '/' ? normalizedPath : '';
      return `${url.protocol}//${url.host}${path}`;
    } catch {
      return null;
    }
  }

  private resolveInitialBaseUrl(): string {
    if (typeof window === 'undefined') {
      return this.defaultHost;
    }

    if (window.ARGUS_DEVICE_HOST) {
      return window.ARGUS_DEVICE_HOST;
    }

    const { protocol, hostname, port } = window.location;
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
      return '/device-api';
    }

    const scheme = protocol === 'https:' ? 'https:' : 'http:';
    const effectivePort = port || '5000';
    return `${scheme}//${hostname}:${effectivePort}`;
  }
}
