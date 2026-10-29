import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceProviderList } from './service-provider-list';
import { provideRouter } from '@angular/router';
import { finalize, of, Subject } from 'rxjs';
import type { PaginatedServiceProviders } from '../../../models/paginated-service-providers.model';
import { ServiceProviderStore } from '../../services/service-provider-store';
import type { ServiceProvider } from '../../../models/service-provider.model';

describe('ServiceProviderList', () => {
  const serviceProvidersStoreStub = {
    getAll: vi.fn(),
  };
  let component: ServiceProviderList;
  let fixture: ComponentFixture<ServiceProviderList>;
  const provider: ServiceProvider = {
    id: 0,
    firstName: 'John',
    lastName: 'Doe',
    profession: 'Plombier',
    city: 'Paris',
    description: "Plombier expérimenté avec 5 ans d'expérience.",
    hourlyRate: 25,
    imageUrl: '',
    available: true,
    ownerUserId: null,
  };

  beforeEach(async () => {
    serviceProvidersStoreStub.getAll
      .mockReset()
      .mockReturnValue(of({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 }));
    await TestBed.configureTestingModule({
      imports: [ServiceProviderList],
      providers: [
        provideRouter([]),
        { provide: ServiceProviderStore, useValue: serviceProvidersStoreStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceProviderList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should cancel the previous search, stay loading and retain the latest results after a late response', () => {
    const parisResponse = new Subject<PaginatedServiceProviders>();
    const lyonResponse = new Subject<PaginatedServiceProviders>();
    const parisFinalized = vi.fn();
    const lyonFinalized = vi.fn();
    const lyonResults: PaginatedServiceProviders = {
      data: [{ ...provider, id: 13, city: 'Lyon' }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
    serviceProvidersStoreStub.getAll
      .mockReturnValueOnce(parisResponse.pipe(finalize(parisFinalized)))
      .mockReturnValueOnce(lyonResponse.pipe(finalize(lyonFinalized)));

    component.cityControl.setValue('Paris');
    component.applyFilters();
    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, city: 'Paris' }),
    );
    expect(parisFinalized).not.toHaveBeenCalled();

    component.cityControl.setValue('Lyon');
    component.applyFilters();

    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, city: 'Lyon' }),
    );
    expect(parisFinalized).toHaveBeenCalledTimes(1);
    expect(lyonFinalized).not.toHaveBeenCalled();
    expect(component.isLoading()).toBe(true);
    expect(component.errorMessage()).toBeNull();

    lyonResponse.next(lyonResults);
    lyonResponse.complete();

    expect(component.isLoading()).toBe(false);
    expect(lyonFinalized).toHaveBeenCalledTimes(1);

    parisResponse.next({ data: [provider], total: 11, page: 2, limit: 10, totalPages: 2 });
    parisResponse.complete();

    expect(component.serviceProviders()).toEqual(lyonResults.data);
    expect(component.currentPage()).toBe(1);
    expect(component.total()).toBe(1);
    expect(component.totalPages()).toBe(1);
    expect(component.cityFilter()).toBe('Lyon');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.provider-grid').textContent).toContain('Lyon');
    expect(fixture.nativeElement.querySelector('.provider-grid').textContent).not.toContain(
      'Paris',
    );
  });

  it('should show a loading error and still allow a later successful page request', () => {
    const failedResponse = new Subject<PaginatedServiceProviders>();
    const retryResponse = new Subject<PaginatedServiceProviders>();
    const retryResults: PaginatedServiceProviders = {
      data: [provider],
      total: 21,
      page: 3,
      limit: 10,
      totalPages: 3,
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    serviceProvidersStoreStub.getAll
      .mockReturnValueOnce(failedResponse)
      .mockReturnValueOnce(retryResponse);

    component.loadPage(2);
    expect(component.isLoading()).toBe(true);
    failedResponse.error(new Error('Network unavailable'));
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBe('Impossible de charger les intervenants.');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Impossible de charger les intervenants.',
    );
    expect(component.currentPage()).toBe(1);

    component.loadPage(3);
    fixture.detectChanges();

    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3 }),
    );
    expect(component.errorMessage()).toBeNull();
    expect(component.isLoading()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();

    retryResponse.next(retryResults);
    retryResponse.complete();

    expect(component.isLoading()).toBe(false);
    expect(component.serviceProviders()).toEqual(retryResults.data);
    expect(component.currentPage()).toBe(3);
    expect(component.total()).toBe(21);
    expect(component.totalPages()).toBe(3);
  });

  it('should display an empty state when no service providers are returned', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Aucun intervenant disponible.');
  });

  it('should cancel a pending page load on destruction and ignore its late results', () => {
    const response = new Subject<PaginatedServiceProviders>();
    const requestFinalized = vi.fn();
    const initialResults = component.serviceProviders();
    serviceProvidersStoreStub.getAll.mockReturnValue(response.pipe(finalize(requestFinalized)));

    component.loadPage(2);

    expect(component.isLoading()).toBe(true);
    expect(requestFinalized).not.toHaveBeenCalled();

    fixture.destroy();

    expect(requestFinalized).toHaveBeenCalledTimes(1);
    expect(component.isLoading()).toBe(false);

    response.next({ data: [], total: 0, page: 2, limit: 10, totalPages: 0 });
    response.complete();

    expect(component.serviceProviders()).toBe(initialResults);
    expect(component.currentPage()).toBe(1);
    expect(component.errorMessage()).toBeNull();
  });

  it('should load the next page when clicking next.', async () => {
    const element = fixture.nativeElement as HTMLElement;

    serviceProvidersStoreStub.getAll.mockReturnValue(
      of({
        data: [provider],
        total: 11,
        page: 2,
        limit: 10,
        totalPages: 2,
      }),
    );
    component.currentPage.set(1);
    component.totalPages.set(2);
    component.searchTerm.set('plombier');
    component.cityFilter.set('Paris');
    component.availabilityFilter.set(false);
    component.sortBy.set('hourlyRate');
    component.sortOrder.set('DESC');
    await fixture.whenStable();

    let button = element.querySelector<HTMLButtonElement>('button[aria-label="Page suivante"]');

    expect(button).not.toBe(null);
    expect(button).toHaveProperty('disabled', false);
    button?.click();
    await fixture.whenStable();
    button = element.querySelector<HTMLButtonElement>('button[aria-label="Page suivante"]');
    expect(button).toHaveProperty('disabled', true);
    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith({
      page: 2,
      search: 'plombier',
      city: 'Paris',
      available: false,
      sortBy: 'hourlyRate',
      sortOrder: 'DESC',
    });
    expect(component.currentPage()).toBe(2);
  });

  it('should load the previous page when clicking previous.', async () => {
    const element = fixture.nativeElement as HTMLElement;

    serviceProvidersStoreStub.getAll.mockReturnValue(
      of({
        data: [provider],
        total: 2,
        page: 1,
        limit: 1,
        totalPages: 2,
      }),
    );
    component.currentPage.set(2);
    component.totalPages.set(2);
    await fixture.whenStable();

    let button = element.querySelector<HTMLButtonElement>('button[aria-label="Page précédente"]');

    expect(button).not.toBe(null);
    expect(button).toHaveProperty('disabled', false);
    button?.click();
    await fixture.whenStable();
    button = element.querySelector<HTMLButtonElement>('button[aria-label="Page précédente"]');
    expect(button).toHaveProperty('disabled', true);
    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith({
      page: 1,
      search: '',
      city: '',
      available: undefined,
      sortBy: 'id',
      sortOrder: 'ASC',
    });
    expect(component.currentPage()).toBe(1);
  });

  it('should apply filters from the first page when submitting the form', async () => {
    const element = fixture.nativeElement as HTMLElement;

    serviceProvidersStoreStub.getAll.mockReturnValue(
      of({
        data: [provider],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    );

    component.searchControl.setValue('    plombier ');
    component.cityControl.setValue('    Paris ');
    component.availabilityControl.setValue('false');
    component.sortByControl.setValue('hourlyRate');
    component.sortOrderControl.setValue('DESC');
    const form = element.querySelector<HTMLFormElement>('form');

    expect(form).not.toBe(null);
    form?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith({
      page: 1,
      search: 'plombier',
      city: 'Paris',
      available: false,
      sortBy: 'hourlyRate',
      sortOrder: 'DESC',
    });

    expect(component.searchTerm()).toBe('plombier');
    expect(component.cityFilter()).toBe('Paris');
    expect(component.availabilityFilter()).toBe(false);
    expect(component.sortBy()).toBe('hourlyRate');
    expect(component.sortOrder()).toBe('DESC');
    expect(component.currentPage()).toBe(1);
  });

  it('should reset filters and load the first page', async () => {
    const element = fixture.nativeElement as HTMLElement;

    component.searchControl.setValue('plombier');
    component.cityControl.setValue('Paris');
    component.availabilityControl.setValue('false');
    component.sortByControl.setValue('hourlyRate');
    component.sortOrderControl.setValue('DESC');
    component.applyFilters();
    await fixture.whenStable();

    const resetButton = element.querySelector<HTMLButtonElement>('.secondary-button');

    expect(resetButton).not.toBe(null);
    resetButton?.click();
    await fixture.whenStable();

    expect(component.searchControl.value).toBe('');
    expect(component.cityControl.value).toBe('');
    expect(component.availabilityControl.value).toBe('');
    expect(component.sortByControl.value).toBe('id');
    expect(component.sortOrderControl.value).toBe('ASC');

    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith({
      page: 1,
      search: '',
      city: '',
      available: undefined,
      sortBy: 'id',
      sortOrder: 'ASC',
    });
  });
});
