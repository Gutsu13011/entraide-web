import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceProviderList } from './service-provider-list';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ServiceProviderStore } from '../../services/service-provider-store';

describe('ServiceProviderList', () => {
  const serviceProvidersStoreStub = {
    getAll: vi.fn(),
  };
  let component: ServiceProviderList;
  let fixture: ComponentFixture<ServiceProviderList>;

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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display an empty state when no service providers are returned', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Aucun intervenant disponible.');
  });

  it('should load the next page when clicking next.', async () => {
    const element = fixture.nativeElement as HTMLElement;

    serviceProvidersStoreStub.getAll.mockReturnValue(
      of({
        data: [
          {
            id: 0,
            firstName: 'John',
            lastName: 'Doe',
            profession: 'Plombier',
            city: 'Paris',
            description: "Plombier expérimenté avec 5 ans d'expérience.",
            hourlyRate: 25,
            imageUrl: '',
            available: true,
          },
        ],
        total: 11,
        page: 2,
        limit: 10,
        totalPages: 2,
      }),
    );
    component.currentPage.set(1);
    component.totalPages.set(2);
    await fixture.whenStable();

    let button = element.querySelector<HTMLButtonElement>('button[aria-label="Page suivante"]');

    expect(button).not.toBe(null);
    expect(button).toHaveProperty('disabled', false);
    button?.click();
    await fixture.whenStable();
    button = element.querySelector<HTMLButtonElement>('button[aria-label="Page suivante"]');
    expect(button).toHaveProperty('disabled', true);
    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith({ page: 2, search: '' });
    expect(component.currentPage()).toBe(2);
  });

  it('should load the previous page when clicking previous.', async () => {
    const element = fixture.nativeElement as HTMLElement;

    serviceProvidersStoreStub.getAll.mockReturnValue(
      of({
        data: [
          {
            id: 0,
            firstName: 'John',
            lastName: 'Doe',
            profession: 'Plombier',
            city: 'Paris',
            description: "Plombier expérimenté avec 5 ans d'expérience.",
            hourlyRate: 25,
            imageUrl: '',
            available: true,
          },
        ],
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
    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith({ page: 1, search: '' });
    expect(component.currentPage()).toBe(1);
  });

  it('should search from the first page when submitting the form', async () => {
    const element = fixture.nativeElement as HTMLElement;

    serviceProvidersStoreStub.getAll.mockReturnValue(
      of({
        data: [
          {
            id: 0,
            firstName: 'John',
            lastName: 'Doe',
            profession: 'Plombier',
            city: 'Paris',
            description: "Plombier expérimenté avec 5 ans d'expérience.",
            hourlyRate: 25,
            imageUrl: '',
            available: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    );

    component.searchControl.setValue('    plombier ');
    const form = element.querySelector<HTMLFormElement>('form');

    expect(form).not.toBe(null);
    form?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(serviceProvidersStoreStub.getAll).toHaveBeenLastCalledWith({
      page: 1,
      search: 'plombier',
    });

    expect(component.searchTerm()).toBe('plombier');
    expect(component.currentPage()).toBe(1);
  });
});
