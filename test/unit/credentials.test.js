const { loadModule } = require('../helpers/loadModule.js');

describe('Credentials Module', () => {
  let Credentials;
  let originalDeleteWithConfirm;

  beforeAll(() => {
    Credentials = loadModule('modules/credentials.js', 'Credentials');
    originalDeleteWithConfirm = Credentials.deleteWithConfirm;
  });

  beforeEach(() => {
    window.DB = { credentials: [] };
    window.Storage = { save: vi.fn(), flush: vi.fn() };
    window.Utils = {
      generateId: vi.fn(() => 'test-id-' + Date.now()),
      getCurrentTimestamp: vi.fn(() => '2024-01-01T00:00:00.000Z'),
      escapeHtml: vi.fn(s => s),
      showError: vi.fn(),
      showSuccess: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true),
      formatDate: vi.fn(d => d)
    };
    window.Security = {
      requireAuthentication: vi.fn(() => Promise.resolve(true))
    };
    window.viewCredential = vi.fn();
    window.openCredentialModal = vi.fn();
    document.getElementById = vi.fn(() => null);
    document.querySelector = vi.fn(() => null);
    document.querySelectorAll = vi.fn(() => []);

    // Reset expandedTags set
    Credentials.expandedTags.clear();
  });

  describe('add()', () => {
    it('should throw error when service is missing', () => {
      expect(() => {
        Credentials.add('', 'user', 'pass');
      }).toThrow('Please fill in all required fields');
    });

    it('should throw error when username is missing', () => {
      expect(() => {
        Credentials.add('service', '', 'pass');
      }).toThrow('Please fill in all required fields');
    });

    it('should throw error when password is missing', () => {
      expect(() => {
        Credentials.add('service', 'user', '');
      }).toThrow('Please fill in all required fields');
    });

    it('should add credential with all fields', () => {
      const result = Credentials.add('GitHub', 'johndoe', 'secret123', 'My GitHub account', 'Token: abc123', 'Work');

      expect(result).toEqual({
        id: expect.any(String),
        service: 'GitHub',
        username: 'johndoe',
        password: 'secret123',
        description: 'My GitHub account',
        additionalDetails: 'Token: abc123',
        notes: 'My GitHub account',
        tag: 'Work',
        createdAt: '2024-01-01T00:00:00.000Z'
      });

      expect(window.DB.credentials).toHaveLength(1);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should add credential with required fields only', () => {
      const result = Credentials.add('Gmail', 'user@example.com', 'pass456');

      expect(result).toEqual({
        id: expect.any(String),
        service: 'Gmail',
        username: 'user@example.com',
        password: 'pass456',
        description: '',
        additionalDetails: '',
        notes: '',
        tag: '',
        createdAt: '2024-01-01T00:00:00.000Z'
      });

      expect(window.DB.credentials).toHaveLength(1);
    });

    it('should maintain backward compatibility with notes field', () => {
      const result = Credentials.add('Service', 'user', 'pass', 'This is a description');

      expect(result.description).toBe('This is a description');
      expect(result.notes).toBe('This is a description');
    });

    it('should generate unique ID for each credential', () => {
      window.Utils.generateId = vi.fn()
        .mockReturnValueOnce('id-1')
        .mockReturnValueOnce('id-2');

      const cred1 = Credentials.add('Service1', 'user1', 'pass1');
      const cred2 = Credentials.add('Service2', 'user2', 'pass2');

      expect(cred1.id).toBe('id-1');
      expect(cred2.id).toBe('id-2');
    });

    it('should handle special characters in service name', () => {
      const result = Credentials.add('Bank & Trust Co.', 'user', 'pass', '<script>alert("xss")</script>');

      expect(result.service).toBe('Bank & Trust Co.');
      expect(result.description).toBe('<script>alert("xss")</script>');
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      window.DB.credentials = [
        {
          id: 'cred-1',
          service: 'OldService',
          username: 'olduser',
          password: 'oldpass',
          description: 'old desc',
          additionalDetails: 'old details',
          notes: 'old desc',
          tag: 'OldTag',
          createdAt: '2023-01-01T00:00:00.000Z'
        }
      ];
    });

    it('should throw error when service is missing', () => {
      expect(() => {
        Credentials.update('cred-1', '', 'user', 'pass');
      }).toThrow('Please fill in all required fields');
    });

    it('should throw error when username is missing', () => {
      expect(() => {
        Credentials.update('cred-1', 'service', '', 'pass');
      }).toThrow('Please fill in all required fields');
    });

    it('should throw error when password is missing', () => {
      expect(() => {
        Credentials.update('cred-1', 'service', 'user', '');
      }).toThrow('Please fill in all required fields');
    });

    it('should update all fields of existing credential', () => {
      const result = Credentials.update('cred-1', 'NewService', 'newuser', 'newpass', 'new desc', 'new details', 'NewTag');

      expect(result).toEqual({
        id: 'cred-1',
        service: 'NewService',
        username: 'newuser',
        password: 'newpass',
        description: 'new desc',
        additionalDetails: 'new details',
        notes: 'new desc',
        tag: 'NewTag',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });

      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should set lastUpdated timestamp', () => {
      const result = Credentials.update('cred-1', 'Service', 'user', 'pass');

      expect(result.lastUpdated).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should return undefined when credential not found', () => {
      const result = Credentials.update('non-existent-id', 'Service', 'user', 'pass');

      expect(result).toBeUndefined();
      expect(window.Storage.save).not.toHaveBeenCalled();
    });

    it('should handle empty tag by setting to empty string', () => {
      const result = Credentials.update('cred-1', 'Service', 'user', 'pass', 'desc', 'details', '');

      expect(result.tag).toBe('');
    });

    it('should maintain backward compatibility with notes field', () => {
      const result = Credentials.update('cred-1', 'Service', 'user', 'pass', 'Updated description');

      expect(result.description).toBe('Updated description');
      expect(result.notes).toBe('Updated description');
    });
  });

  describe('delete()', () => {
    beforeEach(() => {
      window.DB.credentials = [
        { id: 'cred-1', service: 'Service1', username: 'user1', password: 'pass1' },
        { id: 'cred-2', service: 'Service2', username: 'user2', password: 'pass2' },
        { id: 'cred-3', service: 'Service3', username: 'user3', password: 'pass3' }
      ];
    });

    it('should remove credential from array', () => {
      Credentials.delete('cred-2');

      expect(window.DB.credentials).toHaveLength(2);
      expect(window.DB.credentials.find(c => c.id === 'cred-2')).toBeUndefined();
      expect(window.DB.credentials.find(c => c.id === 'cred-1')).toBeDefined();
      expect(window.DB.credentials.find(c => c.id === 'cred-3')).toBeDefined();
    });

    it('should save storage after deletion', () => {
      Credentials.delete('cred-1');

      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should handle deleting non-existent credential gracefully', () => {
      const originalLength = window.DB.credentials.length;
      Credentials.delete('non-existent-id');

      expect(window.DB.credentials).toHaveLength(originalLength);
      expect(window.Storage.save).toHaveBeenCalled();
    });
  });

  describe('getAll()', () => {
    it('should return empty array when no credentials', () => {
      const result = Credentials.getAll();

      expect(result).toEqual([]);
    });

    it('should return all credentials', () => {
      window.DB.credentials = [
        { id: 'cred-1', service: 'Service1' },
        { id: 'cred-2', service: 'Service2' },
        { id: 'cred-3', service: 'Service3' }
      ];

      const result = Credentials.getAll();

      expect(result).toHaveLength(3);
      expect(result).toBe(window.DB.credentials);
    });
  });

  describe('getById()', () => {
    beforeEach(() => {
      window.DB.credentials = [
        { id: 'cred-1', service: 'Service1' },
        { id: '123', service: 'Service2' },
        { id: 456, service: 'Service3' }
      ];
    });

    it('should return correct credential by string ID', () => {
      const result = Credentials.getById('cred-1');

      expect(result).toEqual({ id: 'cred-1', service: 'Service1' });
    });

    it('should handle string ID conversion', () => {
      const result = Credentials.getById('123');

      expect(result).toEqual({ id: '123', service: 'Service2' });
    });

    it('should handle number ID conversion', () => {
      const result = Credentials.getById(456);

      expect(result).toEqual({ id: 456, service: 'Service3' });
    });

    it('should handle mixed number/string ID matching', () => {
      const result = Credentials.getById('456');

      expect(result).toEqual({ id: 456, service: 'Service3' });
    });

    it('should return undefined when credential not found', () => {
      const result = Credentials.getById('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('toggleTag()', () => {
    it('should add tag to expandedTags when not present', () => {
      Credentials.toggleTag('Work');

      expect(Credentials.expandedTags.has('Work')).toBe(true);
    });

    it('should remove tag from expandedTags when present', () => {
      Credentials.expandedTags.add('Work');
      Credentials.toggleTag('Work');

      expect(Credentials.expandedTags.has('Work')).toBe(false);
    });

    it('should toggle same tag multiple times', () => {
      Credentials.toggleTag('Personal');
      expect(Credentials.expandedTags.has('Personal')).toBe(true);

      Credentials.toggleTag('Personal');
      expect(Credentials.expandedTags.has('Personal')).toBe(false);

      Credentials.toggleTag('Personal');
      expect(Credentials.expandedTags.has('Personal')).toBe(true);
    });

    it('should handle multiple different tags independently', () => {
      Credentials.toggleTag('Work');
      Credentials.toggleTag('Personal');

      expect(Credentials.expandedTags.has('Work')).toBe(true);
      expect(Credentials.expandedTags.has('Personal')).toBe(true);

      Credentials.toggleTag('Work');

      expect(Credentials.expandedTags.has('Work')).toBe(false);
      expect(Credentials.expandedTags.has('Personal')).toBe(true);
    });
  });

  describe('toggleAllGroups()', () => {
    it('should collapse all groups when all are expanded', () => {
      const mockGroups = [
        { hasAttribute: vi.fn(() => true), removeAttribute: vi.fn(), setAttribute: vi.fn() },
        { hasAttribute: vi.fn(() => true), removeAttribute: vi.fn(), setAttribute: vi.fn() },
        { hasAttribute: vi.fn(() => true), removeAttribute: vi.fn(), setAttribute: vi.fn() }
      ];

      document.querySelectorAll = vi.fn(() => mockGroups);
      document.getElementById = vi.fn(() => ({ textContent: '' }));

      Credentials.toggleAllGroups();

      mockGroups.forEach(group => {
        expect(group.removeAttribute).toHaveBeenCalledWith('open');
      });
      expect(Credentials.expandedTags.size).toBe(0);
    });

    it('should expand all groups when some are collapsed', () => {
      const mockGroups = [
        {
          hasAttribute: vi.fn(() => true),
          removeAttribute: vi.fn(),
          setAttribute: vi.fn(),
          querySelector: vi.fn(() => ({ textContent: 'Work' }))
        },
        {
          hasAttribute: vi.fn(() => false),
          removeAttribute: vi.fn(),
          setAttribute: vi.fn(),
          querySelector: vi.fn(() => ({ textContent: 'Personal' }))
        }
      ];

      document.querySelectorAll = vi.fn(() => mockGroups);
      document.getElementById = vi.fn(() => ({ textContent: '' }));

      Credentials.toggleAllGroups();

      mockGroups.forEach(group => {
        expect(group.setAttribute).toHaveBeenCalledWith('open', '');
      });
      expect(Credentials.expandedTags.size).toBe(2);
    });

    it('should update button text when collapsing', () => {
      const mockGroups = [
        { hasAttribute: vi.fn(() => true), removeAttribute: vi.fn(), setAttribute: vi.fn() }
      ];
      const mockButton = { textContent: '' };

      document.querySelectorAll = vi.fn(() => mockGroups);
      document.getElementById = vi.fn(() => mockButton);

      Credentials.toggleAllGroups();

      expect(mockButton.textContent).toBe('📂 Expand All');
    });

    it('should update button text when expanding', () => {
      const mockGroups = [
        {
          hasAttribute: vi.fn(() => false),
          removeAttribute: vi.fn(),
          setAttribute: vi.fn(),
          querySelector: vi.fn(() => ({ textContent: 'Work' }))
        }
      ];
      const mockButton = { textContent: '' };

      document.querySelectorAll = vi.fn(() => mockGroups);
      document.getElementById = vi.fn(() => mockButton);

      Credentials.toggleAllGroups();

      expect(mockButton.textContent).toBe('📁 Collapse All');
    });
  });

  describe('viewCredentialSecure()', () => {
    it('should call Security.requireAuthentication with correct parameters', async () => {
      await Credentials.viewCredentialSecure(123);

      expect(window.Security.requireAuthentication).toHaveBeenCalledWith('View Credential', 'credentials');
    });

    it('should call viewCredential when authenticated', async () => {
      window.Security.requireAuthentication = vi.fn(() => Promise.resolve(true));

      await Credentials.viewCredentialSecure(123);

      expect(window.viewCredential).toHaveBeenCalledWith(123);
    });

    it('should not call viewCredential when not authenticated', async () => {
      window.Security.requireAuthentication = vi.fn(() => Promise.resolve(false));

      await Credentials.viewCredentialSecure(123);

      expect(window.viewCredential).not.toHaveBeenCalled();
    });
  });

  describe('editCredentialSecure()', () => {
    it('should call Security.requireAuthentication with correct parameters', async () => {
      await Credentials.editCredentialSecure(456);

      expect(window.Security.requireAuthentication).toHaveBeenCalledWith('Edit Credential', 'credentials');
    });

    it('should call openCredentialModal when authenticated', async () => {
      window.Security.requireAuthentication = vi.fn(() => Promise.resolve(true));

      await Credentials.editCredentialSecure(456);

      expect(window.openCredentialModal).toHaveBeenCalledWith(456);
    });

    it('should not call openCredentialModal when not authenticated', async () => {
      window.Security.requireAuthentication = vi.fn(() => Promise.resolve(false));

      await Credentials.editCredentialSecure(456);

      expect(window.openCredentialModal).not.toHaveBeenCalled();
    });
  });

  describe('deleteCredentialSecure()', () => {
    it('should call Security.requireAuthentication with correct parameters', async () => {
      await Credentials.deleteCredentialSecure(789);

      expect(window.Security.requireAuthentication).toHaveBeenCalledWith('Delete Credential', 'credentials');
    });

    it('should call deleteWithConfirm when authenticated', async () => {
      window.Security.requireAuthentication = vi.fn(() => Promise.resolve(true));
      Credentials.deleteWithConfirm = vi.fn();

      await Credentials.deleteCredentialSecure(789);

      expect(Credentials.deleteWithConfirm).toHaveBeenCalledWith(789);
    });

    it('should not call deleteWithConfirm when not authenticated', async () => {
      window.Security.requireAuthentication = vi.fn(() => Promise.resolve(false));
      Credentials.deleteWithConfirm = vi.fn();

      await Credentials.deleteCredentialSecure(789);

      expect(Credentials.deleteWithConfirm).not.toHaveBeenCalled();
    });
  });

  describe('deleteWithConfirm()', () => {
    beforeEach(() => {
      window.DB.credentials = [
        { id: 'cred-1', service: 'Service1', username: 'user1', password: 'pass1' }
      ];
      Credentials.render = vi.fn();
      // Restore the original method in case previous tests mocked it
      Credentials.deleteWithConfirm = originalDeleteWithConfirm;
    });

    it('should prompt for confirmation', async () => {
      await Credentials.deleteWithConfirm('cred-1');

      expect(window.Utils.confirm).toHaveBeenCalledWith(
        'This will permanently delete this credential. Are you sure?',
        'Delete Credential'
      );
    });

    it('should delete credential when confirmed', async () => {
      window.Utils.confirm.mockResolvedValue(true);

      await Credentials.deleteWithConfirm('cred-1');

      expect(window.DB.credentials).toHaveLength(0);
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Credential deleted');
      expect(Credentials.render).toHaveBeenCalled();
    });

    it('should not delete credential when cancelled', async () => {
      window.Utils.confirm.mockResolvedValue(false);

      await Credentials.deleteWithConfirm('cred-1');

      expect(window.DB.credentials).toHaveLength(1);
      expect(window.Utils.showSuccess).not.toHaveBeenCalled();
      expect(Credentials.render).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string service name in add', () => {
      expect(() => {
        Credentials.add('', 'user', 'pass');
      }).toThrow('Please fill in all required fields');
    });

    it('should handle whitespace-only service name in add', () => {
      const result = Credentials.add('   ', 'user', 'pass');

      expect(result.service).toBe('   ');
    });

    it('should handle special characters in all fields', () => {
      const result = Credentials.add(
        'Service & "Name"',
        'user@example.com',
        'p@$$w0rd!',
        'Description with <html>',
        'Details with \' quotes',
        'Tag/Subtag'
      );

      expect(result.service).toBe('Service & "Name"');
      expect(result.username).toBe('user@example.com');
      expect(result.password).toBe('p@$$w0rd!');
      expect(result.description).toBe('Description with <html>');
      expect(result.additionalDetails).toBe('Details with \' quotes');
      expect(result.tag).toBe('Tag/Subtag');
    });

    it('should handle very long strings in fields', () => {
      const longString = 'a'.repeat(10000);
      const result = Credentials.add('Service', 'user', 'pass', longString);

      expect(result.description).toBe(longString);
      expect(result.notes).toBe(longString);
    });

    it('should handle unicode characters in fields', () => {
      const result = Credentials.add('服务', 'пользователь', 'كلمة السر', '描述', 'تفاصيل', '标签');

      expect(result.service).toBe('服务');
      expect(result.username).toBe('пользователь');
      expect(result.password).toBe('كلمة السر');
      expect(result.description).toBe('描述');
      expect(result.additionalDetails).toBe('تفاصيل');
      expect(result.tag).toBe('标签');
    });
  });
});
