import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceProviderCard } from './service-provider-card';
import { provideRouter } from '@angular/router';
import { ServiceProvider } from '../../../models/service-provider.model';

describe('ServiceProviderCard', () => {
  const mockServiceProvider: ServiceProvider = {
    id: 0,
    firstName: 'John',
    lastName: 'Doe',
    profession: 'Plombier',
    city: 'Paris',
    description: "Plombier expérimenté avec 5 ans d'expérience.",
    hourlyRate: 25,
    imageUrl: '',
    available: true,
  };

  let component: ServiceProviderCard;
  let fixture: ComponentFixture<ServiceProviderCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceProviderCard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceProviderCard);
    fixture.componentRef.setInput('serviceProvider', mockServiceProvider);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h2')?.textContent).toContain('John Doe');
  });
});
