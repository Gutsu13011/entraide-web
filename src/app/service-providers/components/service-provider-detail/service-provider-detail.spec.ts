import { TestBed } from '@angular/core/testing';
import { ServiceProviderDetail } from './service-provider-detail';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { ServiceProvider } from '../../../models/service-provider.model';

describe('ServiceProviderDetail', () => {
  const mockServiceProvider: ServiceProvider = {
    id: 7,
    firstName: 'John',
    lastName: 'Doe',
    profession: 'Plombier',
    city: 'Paris',
    description: "Plombier expérimenté avec 5 ans d'expérience.",
    hourlyRate: 25,
    imageUrl: '',
    available: true,
  };
  const serviceProvidersStoreStub = {
    getById: () => of(mockServiceProvider),
  };

  let component: ServiceProviderDetail;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceProviderDetail],
      providers: [
        provideRouter([
          {
            path: 'service-providers/:id',
            component: ServiceProviderDetail,
          },
        ]),
        {
          provide: ServiceProviderStore,
          useValue: serviceProvidersStoreStub,
        },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl('/service-providers/7', ServiceProviderDetail);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
