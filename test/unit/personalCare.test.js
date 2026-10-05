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
    PersonalCare.expandedSections.clear();
    PersonalCare.activeFilter = 'all';
    PersonalCare.activeTab = 'items';
    PersonalCare.searchTerm = '';
  });

  describe('collapsed by default', () => {
    const openTag = (html, cls) => {
      const m = html.match(new RegExp('<details class="' + cls + '[^"]*"([^>]*)>'));
      return m ? m[1] : null;
    };
    const routine = {
      id: 'r1', name: 'Skincare',
      sections: [{ id: 's1', heading: 'Morning', items: [{ id: 'i1', title: 'Wash' }] }]
    };

    let list;
    beforeEach(() => {
      list = { innerHTML: '' };
      document.getElementById = vi.fn((id) => (id === 'personalcare-list' ? list : null));
      window.DB.personalCareItems = [{ id: '1', name: 'Crocin', category: 'fever' }];
    });

    it('should render category groups collapsed', () => {
      PersonalCare.renderItemsList();
      const attrs = openTag(list.innerHTML, 'personalcare-category-group');
      expect(attrs).not.toBeNull();
      expect(attrs).not.toMatch(/(^|\s)open(\s|$)/);
      expect(attrs).toContain("setCategoryOpen('fever', this.open)");
    });

    it('should keep a category open once the user opens it', () => {
      PersonalCare.setCategoryOpen('fever', true);
      PersonalCare.renderItemsList();
      expect(openTag(list.innerHTML, 'personalcare-category-group')).toMatch(/(^|\s)open(\s|$)/);
      PersonalCare.setCategoryOpen('fever', false);
      PersonalCare.renderItemsList();
      expect(openTag(list.innerHTML, 'personalcare-category-group')).not.toMatch(/(^|\s)open(\s|$)/);
    });

    it('should open groups while searching so matches are visible', () => {
      PersonalCare.searchTerm = 'cro';
      PersonalCare.renderItemsList();
      expect(openTag(list.innerHTML, 'personalcare-category-group')).toMatch(/(^|\s)open(\s|$)/);
    });

    it('should render routine cards and sections collapsed, showing only titles', () => {
      const html = PersonalCare._renderRoutineCard(routine);
      expect(openTag(html, 'personalcare-routine-group')).not.toMatch(/(^|\s)open(\s|$)/);
      expect(openTag(html, 'personalcare-routine-section')).not.toMatch(/(^|\s)open(\s|$)/);
      expect(html).toContain('Morning');
      expect(html).toContain('1 step');
    });

    it('should remember an opened section', () => {
      PersonalCare.toggleSection('r1', 's1', true);
      expect(openTag(PersonalCare._renderRoutineSection(routine, routine.sections[0]), 'personalcare-routine-section'))
        .toMatch(/(^|\s)open(\s|$)/);
      PersonalCare.toggleSection('r1', 's1', false);
      expect(PersonalCare.expandedSections.has('r1:s1')).toBe(false);
    });
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

    it('should expand the saved item\'s category so it stays visible', () => {
      PersonalCare.saveFromModal();
      expect(PersonalCare.expandedCategories.has(window.DB.personalCareItems[0].category)).toBe(true);
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
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Product added');
    });

    it('should update an existing item when id is present', () => {
      window.DB.personalCareItems = [{ id: 'item-1', name: 'Old', category: 'other' }];
      elements['personalcare-modal-id'].value = 'item-1';

      PersonalCare.saveFromModal();

      expect(window.DB.personalCareItems[0].name).toBe('Benadryl');
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Product updated');
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
        'This will permanently delete this product. Are you sure?',
        'Delete Product'
      );
    });

    it('should delete item when confirmed', async () => {
      window.Utils.confirm.mockResolvedValue(true);

      await PersonalCare.handleDelete('item-1');

      expect(window.DB.personalCareItems).toHaveLength(0);
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Product deleted');
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
        expect(window.Utils.showSuccess).toHaveBeenCalledWith('Care plan deleted');
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

      it('should expand the routine and section so the new step is visible', () => {
        PersonalCare.saveRoutineItemModal();
        expect(PersonalCare.expandedRoutines.has('r1')).toBe(true);
        expect(PersonalCare.expandedSections.has('r1:s1')).toBe(true);
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

      it('should update the existing step in place when an item id is set', () => {
        window.DB.personalCareRoutines[0].sections[0].items = [
          { id: 'i1', title: 'Old', tag: 'old tag', description: 'old desc' },
          { id: 'i2', title: 'Second', tag: '', description: '' }
        ];
        elements['personalcare-item-modal-item-id'] = { value: 'i1' };
        elements['personalcare-item-modal-tag'].value = '';

        PersonalCare.saveRoutineItemModal();

        const items = window.DB.personalCareRoutines[0].sections[0].items;
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ id: 'i1', title: 'Body Wash', tag: '', description: 'Lather the **Body Wash** over your body.' });
        expect(window.Utils.showSuccess).toHaveBeenCalledWith('Step updated');
      });
    });

    describe('openRoutineItemModal() edit mode', () => {
      let elements;

      beforeEach(() => {
        elements = {
          'personalcare-item-modal-routine-id': { value: '' },
          'personalcare-item-modal-section-id': { value: '' },
          'personalcare-item-modal-item-id': { value: '' },
          'personalcare-item-modal-title': { value: '' },
          'personalcare-item-modal-tag': { value: '' },
          'personalcare-item-modal-description': { value: '' },
          'personalcare-item-modal-heading-text': { textContent: '' },
          'personalcare-item-modal': { classList: { add: vi.fn(), remove: vi.fn() } }
        };
        document.getElementById = vi.fn((id) => elements[id]);
        window.DB.personalCareRoutines = [{
          id: 'r1', name: 'Skincare',
          sections: [{ id: 's1', heading: 'Morning', items: [{ id: 'i1', title: 'Body Wash', tag: 'T', description: 'D' }] }]
        }];
      });

      it('should prefill fields and show "Edit Step" when an item id is given', () => {
        PersonalCare.openRoutineItemModal('r1', 's1', 'i1');

        expect(elements['personalcare-item-modal-item-id'].value).toBe('i1');
        expect(elements['personalcare-item-modal-title'].value).toBe('Body Wash');
        expect(elements['personalcare-item-modal-tag'].value).toBe('T');
        expect(elements['personalcare-item-modal-description'].value).toBe('D');
        expect(elements['personalcare-item-modal-heading-text'].textContent).toBe('Edit Step');
      });

      it('should clear fields and show "Add Step" when no item id is given', () => {
        elements['personalcare-item-modal-item-id'].value = 'stale';

        PersonalCare.openRoutineItemModal('r1', 's1');

        expect(elements['personalcare-item-modal-item-id'].value).toBe('');
        expect(elements['personalcare-item-modal-title'].value).toBe('');
        expect(elements['personalcare-item-modal-heading-text'].textContent).toBe('Add Step');
      });
    });

    describe('updateRoutine() / updateRoutineSection()', () => {
      beforeEach(() => {
        window.DB.personalCareRoutines = [{ id: 'r1', name: 'Skincare', sections: [{ id: 's1', heading: 'Morning', items: [] }] }];
      });

      it('should rename a routine', () => {
        PersonalCare.updateRoutine('r1', 'Body Care');
        expect(window.DB.personalCareRoutines[0].name).toBe('Body Care');
        expect(window.Storage.save).toHaveBeenCalled();
      });

      it('should rename a section', () => {
        PersonalCare.updateRoutineSection('r1', 's1', 'Night');
        expect(window.DB.personalCareRoutines[0].sections[0].heading).toBe('Night');
      });

      it('should return null for unknown ids', () => {
        expect(PersonalCare.updateRoutine('nope', 'X')).toBeNull();
        expect(PersonalCare.updateRoutineSection('r1', 'nope', 'X')).toBeNull();
        expect(PersonalCare.updateRoutineItem('r1', 's1', 'nope', 'X')).toBeNull();
      });
    });

    describe('saveRoutineModal() / saveSectionModal() edit mode', () => {
      let elements;

      beforeEach(() => {
        elements = {
          'personalcare-routine-modal-id': { value: 'r1' },
          'personalcare-routine-modal-name': { value: 'Body Care' },
          'personalcare-routine-modal': { classList: { add: vi.fn(), remove: vi.fn() } },
          'personalcare-section-modal-routine-id': { value: 'r1' },
          'personalcare-section-modal-section-id': { value: 's1' },
          'personalcare-section-modal-heading': { value: 'Night' },
          'personalcare-section-modal': { classList: { add: vi.fn(), remove: vi.fn() } }
        };
        document.getElementById = vi.fn((id) => elements[id]);
        window.DB.personalCareRoutines = [{ id: 'r1', name: 'Skincare', sections: [{ id: 's1', heading: 'Morning', items: [] }] }];
        PersonalCare.render = vi.fn();
      });

      it('should rename the routine instead of adding a new one', () => {
        PersonalCare.saveRoutineModal();
        expect(window.DB.personalCareRoutines).toHaveLength(1);
        expect(window.DB.personalCareRoutines[0].name).toBe('Body Care');
        expect(window.Utils.showSuccess).toHaveBeenCalledWith('Care plan updated');
      });

      it('should rename the section instead of adding a new one', () => {
        PersonalCare.saveSectionModal();
        const sections = window.DB.personalCareRoutines[0].sections;
        expect(sections).toHaveLength(1);
        expect(sections[0].heading).toBe('Night');
        expect(window.Utils.showSuccess).toHaveBeenCalledWith('Section updated');
      });
    });
  });

  describe('renderFilters()', () => {
    let select, wrap;
    const makeClassList = () => {
      const set = new Set(['hidden']);
      return { toggle: (c, on) => (on ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) };
    };
    beforeEach(() => {
      select = { innerHTML: '', value: '', classList: makeClassList() };
      wrap = { classList: makeClassList() };
      document.getElementById = vi.fn((id) => ({
        'personalcare-filter-select': select,
        'personalcare-filter-wrap': wrap
      })[id] || null);
      window.DB.personalCareItems = [
        { id: '1', name: 'A', category: 'fever' },
        { id: '2', name: 'B', category: 'fever' },
        { id: '3', name: 'C', category: 'fever' },
        { id: '4', name: 'D', category: 'skin_care' }
      ];
    });

    it('should list All (category count) then each used category with its item count', () => {
      PersonalCare.renderFilters();
      expect(select.innerHTML).toContain('<option value="all" selected>All (2)</option>');
      expect(select.innerHTML).toContain('<option value="fever">🌡️ Fever (3)</option>');
      expect(select.innerHTML).toContain('<option value="skin_care">🧴 Skin Care (1)</option>');
      expect(select.innerHTML).not.toContain('Cold & Flu');
      expect(select.value).toBe('all');
      expect(wrap.classList.contains('hidden')).toBe(false);
    });

    it('should mark the active category as selected and tint the dropdown', () => {
      PersonalCare.activeFilter = 'fever';
      PersonalCare.renderFilters();
      expect(select.innerHTML).toContain('<option value="fever" selected>');
      expect(select.value).toBe('fever');
      expect(select.classList.contains('bg-rose-50')).toBe(true);
    });

    it('should reset an active filter whose category no longer has items', () => {
      PersonalCare.activeFilter = 'baby_care';
      PersonalCare.renderFilters();
      expect(PersonalCare.activeFilter).toBe('all');
      expect(select.value).toBe('all');
    });

    it('should hide the dropdown when there are no items', () => {
      select.innerHTML = 'stale';
      window.DB.personalCareItems = [];
      PersonalCare.renderFilters();
      expect(select.innerHTML).toBe('');
      expect(wrap.classList.contains('hidden')).toBe(true);
    });
  });

  describe('setSearch()', () => {
    let list;
    beforeEach(() => {
      list = { innerHTML: '' };
      document.getElementById = vi.fn((id) => (id === 'personalcare-list' ? list : null));
      PersonalCare.activeFilter = 'all';
      window.DB.personalCareItems = [
        { id: '1', name: 'Crocin', category: 'fever', uses: 'Fever, headache', person: 'Mom' },
        { id: '2', name: 'Cetaphil', category: 'skin_care', uses: 'Dry skin', person: 'Baby' }
      ];
    });

    afterEach(() => { PersonalCare.searchTerm = ''; });

    it('should filter items by name case-insensitively', () => {
      PersonalCare.setSearch('  crocin ');
      expect(PersonalCare.searchTerm).toBe('crocin');
      expect(list.innerHTML).toContain('Crocin');
      expect(list.innerHTML).not.toContain('Cetaphil');
    });

    it('should match on uses and person too', () => {
      PersonalCare.setSearch('dry');
      expect(list.innerHTML).toContain('Cetaphil');
      PersonalCare.setSearch('mom');
      expect(list.innerHTML).toContain('Crocin');
      expect(list.innerHTML).not.toContain('Cetaphil');
    });

    it('should show a no-matches state when nothing matches', () => {
      PersonalCare.setSearch('zzz');
      expect(list.innerHTML).toContain('No matches');
    });
  });

  describe('_formatDate()', () => {
    it('should format ISO dates as "D Mon YYYY"', () => {
      expect(PersonalCare._formatDate('2026-03-12')).toBe('12 Mar 2026');
      expect(PersonalCare._formatDate('2026-12-01')).toBe('1 Dec 2026');
    });

    it('should return empty for missing dates and pass through unparseable ones', () => {
      expect(PersonalCare._formatDate('')).toBe('');
      expect(PersonalCare._formatDate(null)).toBe('');
      expect(PersonalCare._formatDate('soon')).toBe('soon');
    });
  });

  describe('renderSummary()', () => {
    let summary;
    beforeEach(() => {
      summary = { innerHTML: 'stale' };
      document.getElementById = vi.fn((id) => (id === 'personalcare-summary' ? summary : null));
    });

    it('should be empty when there are no items or routines', () => {
      window.DB.personalCareItems = [];
      window.DB.personalCareRoutines = [];
      PersonalCare.renderSummary();
      expect(summary.innerHTML).toBe('');
    });

    it('should count items, distinct people (case-insensitive) and routines', () => {
      window.DB.personalCareItems = [
        { id: '1', name: 'A', person: 'Mom' },
        { id: '2', name: 'B', person: 'mom ' },
        { id: '3', name: 'C', person: 'Baby' },
        { id: '4', name: 'D' }
      ];
      window.DB.personalCareRoutines = [{ id: 'r1', name: 'Skincare', sections: [] }];
      PersonalCare.renderSummary();
      const html = summary.innerHTML.replace(/\s+/g, ' ');
      expect(html).toMatch(/>4<\/p> <p[^>]*>Products</);
      expect(html).toMatch(/>2<\/p> <p[^>]*>People</);
      expect(html).toMatch(/>1<\/p> <p[^>]*>Care Plan</);
    });
  });

  describe('routine rendering', () => {
    const routine = {
      id: 'r1',
      name: 'Skincare',
      sections: [
        { id: 's1', heading: 'Morning', items: [{ id: 'i1', title: 'Wash', tag: '1 min', description: 'Use **Cetaphil**' }] },
        { id: 's2', heading: 'Night', items: [] }
      ]
    };

    it('should show section and step counts in the card header', () => {
      const html = PersonalCare._renderRoutineCard(routine);
      expect(html).toContain('2 sections · 1 step');
      expect(html).toContain('Add section');
    });

    it('should label an empty routine', () => {
      const html = PersonalCare._renderRoutineCard({ id: 'r2', name: 'New', sections: [] });
      expect(html).toContain('Empty — tap to start');
    });

    it('should make each step tappable to edit and render bold descriptions', () => {
      const html = PersonalCare._renderRoutineSection(routine, routine.sections[0]);
      expect(html).toContain("PersonalCare.openRoutineItemModal('r1', 's1', 'i1')");
      expect(html).toContain('<strong>Cetaphil</strong>');
      expect(html).toContain('Add step');
    });

    it('should pick a section emoji from its heading', () => {
      expect(PersonalCare._sectionIcon('Morning')).toBe('☀️');
      expect(PersonalCare._sectionIcon('Afternoon touch-up')).toBe('🌤️');
      expect(PersonalCare._sectionIcon('Night')).toBe('🌙');
      expect(PersonalCare._sectionIcon('Weekly')).toBe('📅');
      expect(PersonalCare._sectionIcon('Anything')).toBe('✨');
      expect(PersonalCare._sectionIcon(undefined)).toBe('✨');
    });

    it('should show the empty state when there are no routines', () => {
      const list = { innerHTML: '' };
      document.getElementById = vi.fn((id) => (id === 'personalcare-routines-list' ? list : null));
      window.DB.personalCareRoutines = [];
      PersonalCare.renderRoutinesList();
      expect(list.innerHTML).toContain('No care plans yet');
    });
  });

  describe('delete from edit modals', () => {
    let fields;
    const makeEl = (value = '') => ({ value, classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() } });

    beforeEach(() => {
      window.DB.personalCareRoutines = [{
        id: 'r1', name: 'Skincare',
        sections: [{ id: 's1', heading: 'Morning', items: [{ id: 'i1', title: 'Wash' }, { id: 'i2', title: 'SPF' }] }]
      }];
      fields = {};
      document.getElementById = vi.fn((id) => {
        if (!fields[id]) fields[id] = makeEl();
        return fields[id];
      });
      window.Utils.confirm = vi.fn().mockResolvedValue(true);
      vi.spyOn(PersonalCare, 'render').mockImplementation(() => {});
    });

    it('should show the delete button only in edit mode', () => {
      PersonalCare.openRoutineItemModal('r1', 's1', 'i1');
      expect(fields['personalcare-item-modal-delete'].classList.toggle).toHaveBeenLastCalledWith('hidden', false);
      PersonalCare.openRoutineItemModal('r1', 's1');
      expect(fields['personalcare-item-modal-delete'].classList.toggle).toHaveBeenLastCalledWith('hidden', true);
    });

    it('should delete the step being edited after confirmation', async () => {
      PersonalCare.openRoutineItemModal('r1', 's1', 'i1');
      await PersonalCare.deleteFromRoutineItemModal();
      const items = window.DB.personalCareRoutines[0].sections[0].items;
      expect(items.map(i => i.id)).toEqual(['i2']);
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Step deleted');
    });

    it('should not delete when the user cancels', async () => {
      window.Utils.confirm.mockResolvedValue(false);
      PersonalCare.openRoutineItemModal('r1', 's1', 'i1');
      await PersonalCare.deleteFromRoutineItemModal();
      expect(window.DB.personalCareRoutines[0].sections[0].items).toHaveLength(2);
    });

    it('should delete the section being edited', async () => {
      PersonalCare.openSectionModal('r1', 's1');
      await PersonalCare.deleteFromSectionModal();
      expect(window.DB.personalCareRoutines[0].sections).toHaveLength(0);
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Section deleted');
    });

    it('should delete the routine being edited', async () => {
      PersonalCare.openRoutineModal('r1');
      await PersonalCare.deleteFromRoutineModal();
      expect(window.DB.personalCareRoutines).toHaveLength(0);
      expect(window.Utils.showSuccess).toHaveBeenCalledWith('Care plan deleted');
    });

    it('should do nothing in add mode (no id)', async () => {
      PersonalCare.openRoutineModal();
      await PersonalCare.deleteFromRoutineModal();
      expect(window.Utils.confirm).not.toHaveBeenCalled();
      expect(window.DB.personalCareRoutines).toHaveLength(1);
    });
  });
});

describe('PersonalCare suggestion dropdowns & age autofill', () => {
  let PersonalCare;
  let els;
  const makeEl = (value = '') => ({
    value,
    innerHTML: '',
    classList: {
      _hidden: true,
      add(c) { if (c === 'hidden') this._hidden = true; },
      remove(c) { if (c === 'hidden') this._hidden = false; },
      toggle(c, force) { if (c === 'hidden') this._hidden = force === undefined ? !this._hidden : force; },
      contains(c) { return c === 'hidden' && this._hidden; }
    }
  });

  beforeEach(() => {
    global.window = global.window || {};
    window.DB = {
      personalCareItems: [
        { id: '1', name: 'Crocin', category: 'fever', person: 'Baby', age: 1, date: '2025-01-15' },
        { id: '2', name: 'Cetaphil', category: 'skin_care', person: 'mom', age: 30, date: '2024-06-01' },
        { id: '3', name: 'Calpol', category: 'fever', person: 'Mom', age: 31, date: '2025-06-01' },
        { id: '4', name: 'Vicks', category: 'cold_flu', person: 'Dad', date: '2025-02-01' }
      ],
      personalCareRoutines: []
    };
    window.Storage = { save: vi.fn() };
    window.Utils = {
      escapeHtml: (s) => String(s),
      escapeJsAttr: (s) => String(s),
      showSuccess: vi.fn(),
      showError: vi.fn(),
      formatLocalDate: () => '2026-10-04',
      generateId: () => 'id'
    };
    els = {};
    global.document = global.document || {};
    document.getElementById = vi.fn((id) => {
      if (!els[id]) els[id] = makeEl();
      return els[id];
    });
    PersonalCare = loadModule('modules/personalCare.js', 'PersonalCare');
  });

  describe('getPersonNameSuggestions()', () => {
    it('should de-duplicate case-insensitively keeping the most recent spelling', () => {
      expect(PersonalCare.getPersonNameSuggestions()).toEqual(['Baby', 'Dad', 'Mom']);
    });
  });

  describe('getAgeForPerson()', () => {
    const today = new Date(2026, 9, 4); // 4 Oct 2026

    it('should roll the latest recorded age forward by whole years elapsed', () => {
      expect(PersonalCare.getAgeForPerson('Baby', today)).toBe(2); // 1 on 2025-01-15
      expect(PersonalCare.getAgeForPerson('mom', today)).toBe(32); // latest: 31 on 2025-06-01
    });

    it('should not count a year before the anniversary has passed', () => {
      expect(PersonalCare.getAgeForPerson('Mom', new Date(2026, 4, 31))).toBe(31);
    });

    it('should return null for unknown people or people with no recorded age', () => {
      expect(PersonalCare.getAgeForPerson('Grandpa', today)).toBeNull();
      expect(PersonalCare.getAgeForPerson('Dad', today)).toBeNull();
      expect(PersonalCare.getAgeForPerson('', today)).toBeNull();
    });

    it('should use the recorded age as-is when the item has no date', () => {
      window.DB.personalCareItems = [{ person: 'Nani', age: 70 }];
      expect(PersonalCare.getAgeForPerson('Nani', today)).toBe(70);
    });
  });

  describe('showSuggestions()', () => {
    it('should list all people on empty focus with their age hint', () => {
      PersonalCare.showSuggestions('person', '');
      const box = els['personalcare-person-suggestions'];
      expect(box.classList.contains('hidden')).toBe(false);
      expect(box.innerHTML).toContain("selectSuggestion('person', 'Baby')");
      expect(box.innerHTML).toContain("selectSuggestion('person', 'Dad')");
      expect(box.innerHTML).toMatch(/Mom<\/span>\s*<span[^>]*>\d+ y/);
    });

    it('should filter product names and show the category hint', () => {
      PersonalCare.showSuggestions('name', 'c');
      const html = els['personalcare-name-suggestions'].innerHTML;
      expect(html).toContain('Crocin');
      expect(html).toContain('🌡️ Fever');
      expect(html).toContain('Vicks'); // "c" appears inside "Vicks"
      // Prefix matches rank before substring matches
      expect(html.indexOf('Vicks')).toBeGreaterThan(html.indexOf('Calpol'));
    });

    it('should hide when nothing matches or the only match is already typed', () => {
      PersonalCare.showSuggestions('name', 'zzz');
      expect(els['personalcare-name-suggestions'].classList.contains('hidden')).toBe(true);
      PersonalCare.showSuggestions('name', 'crocin');
      expect(els['personalcare-name-suggestions'].classList.contains('hidden')).toBe(true);
    });

    it('should suggest product names for routine step titles', () => {
      PersonalCare.showSuggestions('step', 'ceta');
      expect(els['personalcare-step-suggestions'].innerHTML).toContain('Cetaphil');
    });
  });

  describe('selectSuggestion()', () => {
    it('should fill the name and auto-detect the category', () => {
      PersonalCare.selectSuggestion('name', 'Cetaphil');
      expect(els['personalcare-modal-name'].value).toBe('Cetaphil');
      expect(els['personalcare-modal-category'].value).toBe('skin_care');
      expect(els['personalcare-name-suggestions'].classList.contains('hidden')).toBe(true);
    });

    it('should fill the person and their age from history, overwriting any age', () => {
      els['personalcare-modal-age'] = makeEl('99');
      PersonalCare.selectSuggestion('person', 'Baby');
      expect(els['personalcare-modal-person'].value).toBe('Baby');
      expect(Number(els['personalcare-modal-age'].value)).toBeGreaterThanOrEqual(1);
      expect(els['personalcare-modal-age'].value).not.toBe('99');
      expect(els['personalcare-age-hint'].classList.contains('hidden')).toBe(false);
    });
  });

  describe('onPersonInput()', () => {
    it('should fill an empty age when a known person is typed', () => {
      PersonalCare.onPersonInput('dad'); // no age on record
      expect(els['personalcare-modal-age'].value).toBe('');
      PersonalCare.onPersonInput('baby');
      expect(els['personalcare-modal-age'].value).not.toBe('');
    });

    it('should never overwrite an age the user typed by hand', () => {
      els['personalcare-modal-age'] = makeEl('5');
      PersonalCare.onAgeInput();
      PersonalCare.onPersonInput('Mom');
      expect(els['personalcare-modal-age'].value).toBe('5');
    });

    it('should clear an auto-filled age when the name no longer matches', () => {
      PersonalCare.onPersonInput('Mom');
      expect(els['personalcare-modal-age'].value).not.toBe('');
      PersonalCare.onPersonInput('Momx');
      expect(els['personalcare-modal-age'].value).toBe('');
      expect(els['personalcare-age-hint'].classList.contains('hidden')).toBe(true);
    });

    it('should update an auto-filled age when switching to another known person', () => {
      PersonalCare.onPersonInput('Mom');
      const momAge = els['personalcare-modal-age'].value;
      PersonalCare.onPersonInput('Baby');
      expect(els['personalcare-modal-age'].value).not.toBe(momAge);
    });
  });
});
