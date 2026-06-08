// Server form modal for add/edit

import { useState, useEffect, type FormEvent } from 'react';
import { Modal } from '../common/Modal';
import { useAppStore } from '../../store/useAppStore';
import type { ServerFormData } from '../../types';
import './ServerForm.css';

export function ServerForm() {
  const { editingServer, isFormOpen, closeForm, createServer, updateServer } =
    useAppStore();

  const [form, setForm] = useState<ServerFormData>({
    alias: '',
    host: '',
    port: 22,
    username: '',
    auth_method: 'password',
    password: '',
    private_key: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEdit = editingServer !== null;

  useEffect(() => {
    if (editingServer) {
      setForm({
        alias: editingServer.alias,
        host: editingServer.host,
        port: editingServer.port,
        username: editingServer.username,
        auth_method: editingServer.auth_method,
        password: '',
        private_key: '',
      });
    } else {
      setForm({
        alias: '',
        host: '',
        port: 22,
        username: '',
        auth_method: 'password',
        password: '',
        private_key: '',
      });
    }
    setError('');
  }, [editingServer, isFormOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.host.trim()) {
      setError('Host is required');
      return;
    }
    if (!form.username.trim()) {
      setError('Username is required');
      return;
    }
    if (form.auth_method === 'password' && !form.password) {
      setError('Password is required');
      return;
    }
    if (form.auth_method === 'private_key' && !form.private_key && !isEdit) {
      setError('Private key is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Partial<ServerFormData> = {
        alias: form.alias,
        host: form.host,
        port: form.port,
        username: form.username,
        auth_method: form.auth_method,
      };

      if (form.auth_method === 'password' && form.password) {
        payload.password = form.password;
      }
      if (form.auth_method === 'private_key' && form.private_key) {
        payload.private_key = form.private_key;
      }

      if (isEdit) {
        await updateServer(editingServer!.id, payload);
      } else {
        await createServer(payload as ServerFormData);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof ServerFormData>(
    key: K,
    value: ServerFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Modal
      open={isFormOpen}
      title={isEdit ? 'Edit Server' : 'Add Server'}
      onClose={closeForm}
    >
      <form onSubmit={handleSubmit} className="server-form">
        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label>Alias</label>
          <input
            type="text"
            value={form.alias}
            onChange={(e) => update('alias', e.target.value)}
            placeholder="My Server"
          />
        </div>

        <div className="form-row">
          <div className="form-group flex-3">
            <label>Host *</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => update('host', e.target.value)}
              placeholder="192.168.1.1 or example.com"
              required
            />
          </div>
          <div className="form-group flex-1">
            <label>Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => update('port', Number(e.target.value))}
              min={1}
              max={65535}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Username *</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => update('username', e.target.value)}
            placeholder="root"
            required
          />
        </div>

        <div className="form-group">
          <label>Auth Method</label>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                name="auth_method"
                value="password"
                checked={form.auth_method === 'password'}
                onChange={() => update('auth_method', 'password')}
              />
              Password
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="auth_method"
                value="private_key"
                checked={form.auth_method === 'private_key'}
                onChange={() => update('auth_method', 'private_key')}
              />
              Private Key
            </label>
          </div>
        </div>

        {form.auth_method === 'password' ? (
          <div className="form-group">
            <label>Password *</label>
            <input
              type="password"
              value={form.password || ''}
              onChange={(e) => update('password', e.target.value)}
              placeholder={isEdit ? '(unchanged if empty)' : 'Enter password'}
            />
          </div>
        ) : (
          <div className="form-group">
            <label>Private Key *</label>
            <textarea
              value={form.private_key || ''}
              onChange={(e) => update('private_key', e.target.value)}
              placeholder={
                isEdit
                  ? '(unchanged if empty)\n-----BEGIN OPENSSH PRIVATE KEY-----'
                  : '-----BEGIN OPENSSH PRIVATE KEY-----\n...'
              }
              rows={5}
            />
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={closeForm}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : isEdit ? 'Update' : 'Add Server'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
