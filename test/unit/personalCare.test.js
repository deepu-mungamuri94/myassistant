const { loadModule } = require('../helpers/loadModule.js');

describe('PersonalCare Module', () => {
  let PersonalCare;

  beforeAll(() => {
    PersonalCare = loadModule('modules/personalCare.js', 'PersonalCare');
  });

  beforeEach(() => {
    window.DB = { personalCareItems: [], personalCareRoutines: [] };
    window.Storage = { save: vi.fn(), flush: vi.fn() };
    window.Utils = {
      generateId: vi.fn(() => 'test-id-' + Date.now()),
      getCurrentTimestamp: vi.fn(() => '2024-01-01T00:00:00.000Z'),
      formatLocalDate: vi.fn(() => '2024-01-01'),
      escapeHtml: vi.fn(s => s),
      escapeJsAttr: vi.fn(s => s),
      formatIndianNumber: vi.fn(n => String(n)),
      showError: vi.fn(),
      showSuccess: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true)
    };
    document.getElementById = vi.fn(() => null);
    document.querySelector = vi.fn(() => null);
    document.querySelectorAll = vi.fn(() => []);

    PersonalCare.expandedCategories.clear();
    PersonalCare.expandedRoutines.clear();
    PersonalCare.activeFilter = 'all';
    PersonalCare.activeTab = 'items';
  });

  describe('add()', () => {
    it('should add an item with all fields', () => {
      const result = PersonalCare.add({
        name: 'Crocin',
        category: 'fever',
        description: 'Paracetamol tablet',
        uses: 'Fever, body ache',
        price: 25,
        currency: 'INR',
        person: 'Mom',
        age: 55,
        date: '2024-05-01'
      });

      expect(result).toEqual({
        id: expect.any(String),
        name: 'Crocin',
        category: 'fever',
        description: 'Paracetamol tablet',
        uses: 'Fever, body ache',
        price: 25,
        currency: 'INR',
        person: 'Mom',
        age: 55,
        date: '2024-05-01',
        createdAt: '2024-01-01T00:00:00.000Z'
      });

      expect(window.DB.personalCareItems).toHaveLength(1);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should default category to other when missing', () => {
      const result = PersonalCare.add({ name: 'Mystery Cream' });

      expect(result.category).toBe('other');
    });

    it('should default currency to INR when missing', () => {
      const result = PersonalCare.add({ name: 'Item', price: 10 });

      expect(result.currency).toBe('INR');
    });

    it('should default price to null when missing', () => {
      const result = PersonalCare.add({ name: 'Item' });

      expect(result.price).toBeNull();
    });

    it('should default person to empty string when missing', () => {
      const result = PersonalCare.add({ name: 'Item' });

      expect(result.person).toBe('');
    });

    it('should default age to null when missing', () => {
      const result = PersonalCare.add({ name: 'Item' });

      expect(result.age).toBeNull();
    });

    it('should default date to today when missing', () => {
      const result = PersonalCare.add({ name: 'Item' });

      expect(result.date).toBe('2024-01-01');
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      window.DB.personalCareItems = [
        { id: 'item-1', name: 'Old Name', category: 'other', price: 10, createdAt: '2023-01-01T00:00:00.000Z' }
      ];
    });

    it('should update fields of an existing item', () => {
      const result = PersonalCare.update('item-1', { name: 'New Name', price: 50 });

      expect(result.name).toBe('New Name');
      expect(result.price).toBe(50);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should return null when item not found', () => {
      const result = PersonalCare.update('non-existent', { name: 'X' });

      expect(result).toBeNull();
      expect(window.Storage.save).not.toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    beforeEach(() => {
      window.DB.personalCareItems = [
        { id: 'item-1', name: 'Item1' },
        { id: 'item-2', name: 'Item2' },
        { id: 'item-3', name: 'Item3' }
      ];
    });

    it('should remove item from array', () => {
      PersonalCare.delete('item-2');

      expect(window.DB.personalCareItems).toHaveLength(2);
      expect(window.DB.personalCareItems.find(i => i.id === 'item-2')).toBeUndefined();
    });

    it('should save storage after deletion', () => {
      PersonalCare.delete('item-1');

      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should handle deleting non-existent item gracefully', () => {
      const originalLength = window.DB.personalCareItems.length;
      PersonalCare.delete('non-existent');

      expect(window.DB.personalCareItems).toHaveLength(originalLength);
    });
  });

  describe('getById()', () => {
    beforeEach(() => {
      window.DB.personalCareItems = [
        { id: 'item-1', name: 'Item1' },
        { id: 123, name: 'Item2' }
      ];
    });

    it('should return correct item by string id', () => {
      expect(PersonalCare.getById('item-1')).toEqual({ id: 'item-1', name: 'Item1' });
    });

    it('should handle number/string id matching', () => {
      expect(PersonalCare.getById('123')).toEqual({ id: 123, name: 'Item2' });
    });

    it('should return undefined when not found', () => {
      expect(PersonalCare.getById('nope')).toBeUndefined();
    });
  });

  describe('toggleCategory()', () => {
    it('should add category to expandedCategories when not present', () => {
      PersonalCare.toggleCategory('fever');
      expect(PersonalCare.expandedCategories.has('fever')).toBe(true);
    });

    it('should remove category from expandedCategories when present', () => {
      PersonalCare.expandedCategories.add('fever');
      PersonalCare.toggleCategory('fever');
      expect(PersonalCare.expandedCategories.has('fever')).toBe(false);
    });
  });

  describe('toggleRoutine()', () => {
    it('should default to collapsed (not in expandedRoutines) for a new routine', () => {
      expect(PersonalCare.expandedRoutines.has('r1')).toBe(false);
    });

    it('should add routine to expandedRoutines when opened', () => {
      PersonalCare.toggleRoutine('r1', true);
      expect(PersonalCare.expandedRoutines.has('r1')).toBe(true);
    });

    it('should remove routine from expandedRoutines when closed', () => {
      PersonalCare.expandedRoutines.add('r1');
      PersonalCare.toggleRoutine('r1', false);
      expect(PersonalCare.expandedRoutines.has('r1')).toBe(false);
    });
  });

  describe('setFilter()', () => {
    it('should set activeFilter and trigger render', () => {
      PersonalCare.render = vi.fn();
      PersonalCare.setFilter('skin_care');

      expect(PersonalCare.activeFilter).toBe('skin_care');
      expect(PersonalCare.render).toHaveBeenCalled();
    });
  });

  describe('switchTab()', () => {
    it('should set activeTab and trigger render', () => {
      PersonalCare.render = vi.fn();
      PersonalCare.switchTab('routines');

      expect(PersonalCare.activeTab).toBe('routines');
      expect(PersonalCare.render).toHaveBeenCalled();
    });
  });

  describe('getProductNameSuggestions()', () => {
    beforeEach(() => {
      window.DB.personalCareItems = [
        { name: 'Crocin', date: '2024-01-01' },
        { name: 'Benadryl', date: '2024-02-01' },
        { name: 'Crocin', date: '2024-03-01' }
      ];
    });

    it('should dedupe by name, keeping the most recent record', () => {
      const result = PersonalCare.getProductNameSuggestions();

      const crocin = result.find(i => i.name === 'Crocin');
      expect(result).toHaveLength(2);
      expect(crocin.date).toBe('2024-03-01');
    });

    it('should filter by search term case-insensitively', () => {
      const result = PersonalCare.getProductNameSuggestions('benadryl');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Benadryl');
    });
  });

  describe('getPersonNameSuggestions()', () => {
    it('should return distinct, sorted person names', () => {
      window.DB.personalCareItems = [
        { person: 'Mom' },
        { person: 'Dad' },
        { person: 'Mom' },
        { person: '' }
      ];

      expect(PersonalCare.getPersonNameSuggestions()).toEqual(['Dad', 'Mom']);
    });
  });

  describe('getLastCategoryForName()', () => {
    it('should return the category of the most recent matching item', () => {
      window.DB.personalCareItems = [
        { name: 'Crocin', category: 'fever', date: '2024-01-01' },
        { name: 'Crocin', category: 'cold_flu', date: '2024-03-01' }
      ];

      expect(PersonalCare.getLastCategoryForName('crocin')).toBe('cold_flu');
    });

    it('should return null when no match found', () => {
      window.DB.personalCareItems = [];

      expect(PersonalCare.getLastCategoryForName('Unknown')).toBeNull();
    });

    it('should return null when name is empty', () => {
      expect(PersonalCare.getLastCategoryForName('')).toBeNull();
    });
  });

  describe('onNameInput()', () => {
    it('should auto-fill the category input when a match is found', () => {
      window.DB.personalCareItems = [{ name: 'Crocin', category: 'fever', date: '2024-01-01' }];
      const categoryInput = { value: '' };
      document.getElementById = vi.fn((id) => id === 'personalcare-modal-category' ? categoryInput : null);

      PersonalCare.onNameInput('Crocin');

      expect(categoryInput.value).toBe('fever');
    });

    it('should not touch the category input when no match is found', () => {
      window.DB.personalCareItems = [];
      const categoryInput = { value: 'other' };
      document.getElementById = vi.fn((id) => id === 'personalcare-modal-category' ? categoryInput : null);

      PersonalCare.onNameInput('Unknown');

      expect(categoryInput.value).toBe('other');
    });
  });

  describe('saveFromModal()', () => {
    let elements;

    beforeEach(() => {
      elements = {
        'personalcare-modal-id': { value: '' },
        'personalcare-modal-name': { value: 'Benadryl' },
        'personalcare-modal-category': { value: 'cold_flu' },
        'personalcare-modal-uses': { value: 'Runny nose' },
        'personalcare-modal-price': { value: '120' },
        'personalcare-modal-person': { value: 'Dad' },
        'personalcare-modal-age': { value: '40' },
        'personalcare-modal-date': { value: '2024-06-01' },
        'personalcare-modal-description': { value: 'Take at night' },
        'personalcare-modal': { classList: { add: vi.fn(), remove: vi.fn() } }
      };
      document.getElementById = vi.fn((id) => elements[id]);
      PersonalCare.render = vi.fn();
    });

    it('should show error and not save when name is empty', () => {
      elements['personalcare-modal-name'].value = '   ';

      PersonalCare.saveFromModal();

      expect(window.Utils.showError).toHaveBeenCalledWith('Product name is required');
      expect(window.DB.personalCareItems).toHaveLength(0);
    });

    it('should add a new item when id is empty', () => {
      PersonalCare.saveFromModal();

      expect(window.DB.personalCareItems).toHaveLength(1);
      expect(window.DB.personalCareItems[0]).toMatchObject({
        name: 'Benadryl',
        category: 'cold_flu',
        uses: 'Runny nose',
        price: 120,
        person: 'Dad',
        age: 40,
        date: '2024-06-01',
        description: 'Take at night'
      });
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Item added');
    });

    it('should update an existing item when id is present', () => {
      window.DB.personalCareItems = [{ id: 'item-1', name: 'Old', category: 'other' }];
      elements['personalcare-modal-id'].value = 'item-1';

      PersonalCare.saveFromModal();

      expect(window.DB.personalCareItems[0].name).toBe('Benadryl');
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Item updated');
    });

    it('should treat empty price as null', () => {
      elements['personalcare-modal-price'].value = '';

      PersonalCare.saveFromModal();

      expect(window.DB.personalCareItems[0].price).toBeNull();
    });

    it('should treat empty age as null', () => {
      elements['personalcare-modal-age'].value = '';

      PersonalCare.saveFromModal();

      expect(window.DB.personalCareItems[0].age).toBeNull();
    });

    it('should default date to today when empty', () => {
      elements['personalcare-modal-date'].value = '';

      PersonalCare.saveFromModal();

      expect(window.DB.personalCareItems[0].date).toBe('2024-01-01');
    });

    it('should close the modal after saving', () => {
      PersonalCare.saveFromModal();

      expect(elements['personalcare-modal'].classList.add).toHaveBeenCalledWith('hidden');
    });
  });

  describe('handleDelete()', () => {
    beforeEach(() => {
      window.DB.personalCareItems = [{ id: 'item-1', name: 'Item1' }];
      PersonalCare.render = vi.fn();
    });

    it('should prompt for confirmation', async () => {
      await PersonalCare.handleDelete('item-1');

      expect(window.Utils.confirm).toHaveBeenCalledWith(
        'This will permanently delete this item. Are you sure?',
        'Delete Item'
      );
    });

    it('should delete item when confirmed', async () => {
      window.Utils.confirm.mockResolvedValue(true);

      await PersonalCare.handleDelete('item-1');

      expect(window.DB.personalCareItems).toHaveLength(0);
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Item deleted');
      expect(PersonalCare.render).toHaveBeenCalled();
    });

    it('should not delete item when cancelled', async () => {
      window.Utils.confirm.mockResolvedValue(false);

      await PersonalCare.handleDelete('item-1');

      expect(window.DB.personalCareItems).toHaveLength(1);
      expect(window.Utils.showSuccess).not.toHaveBeenCalled();
      expect(PersonalCare.render).not.toHaveBeenCalled();
    });
  });

  describe('Routines', () => {
    describe('addRoutine()', () => {
      it('should add a routine with an empty sections list', () => {
        const result = PersonalCare.addRoutine('Skincare');

        expect(result).toEqual({
          id: expect.any(String),
          name: 'Skincare',
          sections: [],
          createdAt: '2024-01-01T00:00:00.000Z'
        });
        expect(window.DB.personalCareRoutines).toHaveLength(1);
        expect(window.Storage.save).toHaveBeenCalled();
      });
    });

    describe('deleteRoutine()', () => {
      it('should remove the routine by id', () => {
        window.DB.personalCareRoutines = [{ id: 'r1', name: 'Skincare', sections: [] }];

        PersonalCare.deleteRoutine('r1');

        expect(window.DB.personalCareRoutines).toHaveLength(0);
      });
    });

    describe('addRoutineSection() / addRoutineItem()', () => {
      it('should add a section and then a numbered step under it', () => {
        const routine = PersonalCare.addRoutine('Skincare');

        const section = PersonalCare.addRoutineSection(routine.id, 'Morning');
        expect(section.heading).toBe('Morning');
        expect(routine.sections).toHaveLength(1);

        const item = PersonalCare.addRoutineItem(routine.id, section.id, 'Body Wash', 'Target dark joints (1-2 mins)', 'Lather the **Be Bodywise 5% AHA BHA Body Wash**.');
        expect(item).toMatchObject({
          title: 'Body Wash',
          tag: 'Target dark joints (1-2 mins)',
          description: 'Lather the **Be Bodywise 5% AHA BHA Body Wash**.'
        });
        expect(section.items).toHaveLength(1);
      });

      it('should default tag and description to empty string when omitted', () => {
        const routine = PersonalCare.addRoutine('Skincare');
        const section = PersonalCare.addRoutineSection(routine.id, 'Morning');

        const item = PersonalCare.addRoutineItem(routine.id, section.id, 'Body Wash');

        expect(item.tag).toBe('');
        expect(item.description).toBe('');
      });

      it('should return null when the routine does not exist', () => {
        expect(PersonalCare.addRoutineSection('missing', 'Morning')).toBeNull();
      });

      it('should return null when the section does not exist', () => {
        const routine = PersonalCare.addRoutine('Skincare');

        expect(PersonalCare.addRoutineItem(routine.id, 'missing-section', 'Body Wash')).toBeNull();
      });
    });

    describe('deleteRoutineSection() / deleteRoutineItem()', () => {
      it('should remove a section from a routine', () => {
        const routine = PersonalCare.addRoutine('Skincare');
        const section = PersonalCare.addRoutineSection(routine.id, 'Morning');

        PersonalCare.deleteRoutineSection(routine.id, section.id);

        expect(routine.sections).toHaveLength(0);
      });

      it('should remove an item from a section', () => {
        const routine = PersonalCare.addRoutine('Skincare');
        const section = PersonalCare.addRoutineSection(routine.id, 'Morning');
        const item = PersonalCare.addRoutineItem(routine.id, section.id, 'Sunscreen');

        PersonalCare.deleteRoutineItem(routine.id, section.id, item.id);

        expect(section.items).toHaveLength(0);
      });
    });

    describe('handleDeleteRoutine()', () => {
      beforeEach(() => {
        window.DB.personalCareRoutines = [{ id: 'r1', name: 'Skincare', sections: [] }];
        PersonalCare.render = vi.fn();
      });

      it('should delete the routine when confirmed', async () => {
        window.Utils.confirm.mockResolvedValue(true);

        await PersonalCare.handleDeleteRoutine('r1');

        expect(window.DB.personalCareRoutines).toHaveLength(0);
        expect(window.Utils.showSuccess).toHaveBeenCalledWith('Routine deleted');
      });

      it('should not delete the routine when cancelled', async () => {
        window.Utils.confirm.mockResolvedValue(false);

        await PersonalCare.handleDeleteRoutine('r1');

        expect(window.DB.personalCareRoutines).toHaveLength(1);
      });
    });

    describe('_renderStepDescription()', () => {
      it('should render **bold** markers as <strong> tags', () => {
        const result = PersonalCare._renderStepDescription('Lather the **Body Wash** over your body.');

        expect(result).toBe('Lather the <strong>Body Wash</strong> over your body.');
      });

      it('should handle multiple bold segments', () => {
        const result = PersonalCare._renderStepDescription('**A** and **B**');

        expect(result).toBe('<strong>A</strong> and <strong>B</strong>');
      });

      it('should leave text without bold markers unchanged', () => {
        const result = PersonalCare._renderStepDescription('Plain instructions');

        expect(result).toBe('Plain instructions');
      });
    });

    describe('saveRoutineItemModal()', () => {
      let elements;

      beforeEach(() => {
        elements = {
          'personalcare-item-modal-routine-id': { value: 'r1' },
          'personalcare-item-modal-section-id': { value: 's1' },
          'personalcare-item-modal-title': { value: 'Body Wash' },
          'personalcare-item-modal-tag': { value: 'Target dark joints (1-2 mins)' },
          'personalcare-item-modal-description': { value: 'Lather the **Body Wash** over your body.' },
          'personalcare-item-modal': { classList: { add: vi.fn(), remove: vi.fn() } }
        };
        document.getElementById = vi.fn((id) => elements[id]);
        window.DB.personalCareRoutines = [{ id: 'r1', name: 'Skincare', sections: [{ id: 's1', heading: 'Morning', items: [] }] }];
        PersonalCare.render = vi.fn();
      });

      it('should show error and not save when title is empty', () => {
        elements['personalcare-item-modal-title'].value = '   ';

        PersonalCare.saveRoutineItemModal();

        expect(window.Utils.showError).toHaveBeenCalledWith('Step title is required');
        expect(window.DB.personalCareRoutines[0].sections[0].items).toHaveLength(0);
      });

      it('should add a step with title, tag, and description', () => {
        PersonalCare.saveRoutineItemModal();

        expect(window.DB.personalCareRoutines[0].sections[0].items[0]).toMatchObject({
          title: 'Body Wash',
          tag: 'Target dark joints (1-2 mins)',
          description: 'Lather the **Body Wash** over your body.'
        });
        expect(window.Utils.showSuccess).toHaveBeenCalledWith('Step added');
      });
    });
  });
});
