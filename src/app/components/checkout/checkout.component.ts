import { Component, OnInit } from '@angular/core';
import {FormBuilder, FormControl, FormGroup, Validators} from "@angular/forms";
import {Luv2ShopFormService} from "../../services/luv2-shop-form.service";
import {Country} from "../../common/country";
import {State} from "../../common/state";
import {Luv2ShopValidators} from "../../validators/luv2-shop-validators";
import {CartService} from "../../services/cart.service";
import {CheckoutService} from "../../services/checkout.service";
import {Router} from "@angular/router";
import {Order} from "../../common/order";
import {OrderItem} from "../../common/order-item";
import {Purchase} from "../../common/purchase";
import {environment} from "../../../environments/environment";
import {PaymentInfo} from "../../common/payment-info";

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {
  checkoutFormGroup!: FormGroup;
  totalPrice:number=0;
  totalQuantity:number=0;

  creditCardYears:number[]=[];
  creditCardMonths:number[]=[];

  countries:Country[]=[];

  shippingAddressStates:State[]=[];
  billingAddressStates:State[]=[];

  storage:Storage=sessionStorage;

  //initialize Stripe API
  stripe=Stripe(environment.stripePublishableKey);
  paymentInfo:PaymentInfo=new PaymentInfo();
  cardElement:any;
  displayError:any="";
  isDisabled:boolean=false;
  constructor(private formBuilder:FormBuilder,
              private luv2ShopFormService:Luv2ShopFormService,
              private cartService:CartService,
              private checkoutService:CheckoutService,
              private router:Router) { }

  ngOnInit(): void {

    //setup Stripe payment form
    this.setupStripePaymentForm();

    this.reviewCartDetails();

    const theEmail=JSON.parse(this.storage.getItem('userEmail')!)

    this.checkoutFormGroup=this.formBuilder.group({
      customer:this.formBuilder.group(
        {
          firstName:new FormControl('',
              [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
          lastName:new FormControl('',
            [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
          email:new FormControl(theEmail,
            [Validators.required,Validators.email])
        }
      ),
      shippingAddress:this.formBuilder.group({
        street:new FormControl('',
          [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
        city:new FormControl('',
          [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
        state:new FormControl('', [Validators.required]),
        country:new FormControl('', [Validators.required]),
        zipCode:new FormControl('',
          [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
      }),
      billingAddress:this.formBuilder.group({
        street:new FormControl('',
          [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
        city:new FormControl('',
          [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace]),
        state:new FormControl('', [Validators.required]),
        country:new FormControl('', [Validators.required]),
        zipCode:new FormControl('',
          [Validators.required,Validators.minLength(2),Luv2ShopValidators.notOnlyWhitespace])
      }),
      creditCard:this.formBuilder.group({
        // cardType:new FormControl('',[Validators.required]),
        // nameOnCard:new FormControl('',[Validators.required,Validators.minLength(2),
        //                            Luv2ShopValidators.notOnlyWhitespace]),
        // cardNumber:new FormControl('',[Validators.required,Validators.pattern('[0-9]{16}')]),
        // securityCode:new FormControl('',[Validators.required,Validators.pattern('[0-9]{3}')]),
        // expirationMonth:[''],
        // expirationYear:['']
      })
      }
    );



    //populate countries
    this.luv2ShopFormService.getCountries().subscribe(
      data=>{
        console.log(JSON.stringify(data));
        this.countries=data;
      }
    );

  }

  onSubmit(){
    if(this.checkoutFormGroup.invalid){
      this.checkoutFormGroup.markAllAsTouched();
      return;
    }

    // @ts-ignore
    let order=new Order();
    order.totalPrice=this.totalPrice;
    order.totalQuantity=this.totalQuantity;
    const cartItems=this.cartService.cartItems;
    let orderItems:OrderItem[]=cartItems.map(temp=>new OrderItem(temp));
    // @ts-ignore
    let purchase=new Purchase();
    purchase.customer=this.checkoutFormGroup.controls['customer'].value;
    purchase.shippingAddress=this.checkoutFormGroup.controls['shippingAddress'].value;
    const shippingState:State=JSON.parse(JSON.stringify(purchase.shippingAddress.state));
    const shippingCountry:Country=JSON.parse(JSON.stringify(purchase.shippingAddress.country));
    purchase.shippingAddress.state=shippingState.name;
    purchase.shippingAddress.country=shippingCountry.name;

    purchase.billingAddress=this.checkoutFormGroup.controls['billingAddress'].value;
    const billingState:State=JSON.parse(JSON.stringify(purchase.billingAddress.state));
    const billingCountry:Country=JSON.parse(JSON.stringify(purchase.billingAddress.country));
    purchase.billingAddress.state=billingState.name;
    purchase.billingAddress.country=billingCountry.name;

    purchase.order=order;
    purchase.orderItems=orderItems;

    //compute payment info
    this.paymentInfo.amount=Math.round(this.totalPrice*100);
    this.paymentInfo.currency="USD";
    this.paymentInfo.receiptEmail=purchase.customer.email;

    if(!this.checkoutFormGroup.invalid && this.displayError.textContent ===""){
      this.isDisabled=true;
      this.checkoutService.createPaymentIntent(this.paymentInfo).subscribe(
        (paymentIntentResponse)=>{
          this.stripe.confirmCardPayment(paymentIntentResponse.client_secret,
            {
              payment_method:{
                card:this.cardElement,
                billing_details:{
                  email:purchase.customer.email,
                  name:`${purchase.customer.firstName} ${purchase.customer.lastName}`,
                  address:{
                    line1:purchase.billingAddress.street,
                    city:purchase.billingAddress.city,
                    state:purchase.billingAddress.state,
                    postal_code:purchase.billingAddress.zipCode,
                    country:this.billingAddressCountry?.value.code
                  }

                }
              }
            },{handleAction:false})
            .then((result:any)=>{
            if(result.error){
              alert(`There was an error:${result.error.message}`);
              this.isDisabled=false;
            }else{
              //place the order
              this.checkoutService.placeOrder(purchase).subscribe({
                next:(response:any)=>{
                  alert(`Your order has been received.\nOrder tracking number: ${response.orderTrackingNumber}`)
                  this.resetCart();
                  this.isDisabled=false;
                },
                error:(err:any)=>{
                  alert(`There was an error: ${err.message}`);
                  this.isDisabled=false;
                }
              })
            }

          })
        }
      );
    }else{
      this.checkoutFormGroup.markAllAsTouched();
      return;
    }

  }
  resetCart(){
    this.cartService.cartItems=[];
    this.cartService.totalPrice.next(0);
    this.cartService.totalQuantity.next(0);
    this.cartService.persistCartItems();
    this.checkoutFormGroup.reset();
    this.router.navigateByUrl("/products");
  }

  get firstName(){
    return this.checkoutFormGroup.get('customer.firstName');
  }
  get lastName(){
    return this.checkoutFormGroup.get('customer.lastName');
  }
  get email(){
    return this.checkoutFormGroup.get('customer.email');
  }
  get shippingAddressStreet(){
    return this.checkoutFormGroup.get('shippingAddress.street');
  }
  get shippingAddressCity(){
    return this.checkoutFormGroup.get('shippingAddress.city');
  }
  get shippingAddressState(){
    return this.checkoutFormGroup.get('shippingAddress.state');
  }
  get shippingAddressZipCode(){
    return this.checkoutFormGroup.get('shippingAddress.zipCode');
  }
  get shippingAddressCountry(){
    return this.checkoutFormGroup.get('shippingAddress.country');
  }
  get billingAddressStreet(){
    return this.checkoutFormGroup.get('billingAddress.street');
  }
  get billingAddressCity(){
    return this.checkoutFormGroup.get('billingAddress.city');
  }
  get billingAddressState(){
    return this.checkoutFormGroup.get('billingAddress.state');
  }
  get billingAddressZipCode(){
    return this.checkoutFormGroup.get('billingAddress.zipCode');
  }
  get billingAddressCountry(){
    return this.checkoutFormGroup.get('billingAddress.country');
  }
  get creditCardType(){
    return this.checkoutFormGroup.get('creditCard.cardType');
  }
  get creditCardNameOnCard(){
    return this.checkoutFormGroup.get('creditCard.nameOnCard');
  }
  get creditCardNumber(){
    return this.checkoutFormGroup.get('creditCard.cardNumber');
  }
  get creditCardSecurityCode(){
    return this.checkoutFormGroup.get('creditCard.securityCode');
  }






  copyShippingAddressToBillingAddress(event: Event){
    // @ts-ignore
    if (event.target.checked) {
      this.checkoutFormGroup.controls['billingAddress']
        .setValue(this.checkoutFormGroup.controls['shippingAddress'].value);

      this.billingAddressStates=this.shippingAddressStates;
    }
    else {
      this.checkoutFormGroup.controls['billingAddress'].reset();
      this.billingAddressStates=[];
    }
  }

  handleMonthsAndYears(){
    const creditCardFormGroup=this.checkoutFormGroup.get('creditCard');
    const currentYear:number=new Date().getFullYear();
    // @ts-ignore
    const selectedYear:number=Number(creditCardFormGroup.value.expirationYear);
    let startMonth:number;
    if( currentYear === selectedYear){
      startMonth=new Date().getMonth()+1;
    }
    else{
      startMonth=1;
    }
    this.luv2ShopFormService.getCreditCardMonth(startMonth).subscribe(
      data=>{
        console.log(JSON.stringify(data));
        this.creditCardMonths=data;
      }
    );

  }

  getStates(formGroupName:string){
    const formGroup=this.checkoutFormGroup.get(formGroupName);
    // @ts-ignore
    const countryCode=formGroup.value.country.code;
    // @ts-ignore
    const countryName=formGroup.value.country.name;
    console.log(`${countryCode}`);
    console.log(`${countryName}`);
    this.luv2ShopFormService.getStates(countryCode).subscribe(
      data=>{
        if(formGroupName === 'shippingAddress'){
          this.shippingAddressStates=data;
        }
        else{
          this.billingAddressStates=data;
        }
        // @ts-ignore
        formGroup.get('state').setValue(data[0]);

      }
    );
  }

   reviewCartDetails() {
    this.cartService.totalQuantity.subscribe(
      totalQuantity=>this.totalQuantity=totalQuantity
    );

    this.cartService.totalPrice.subscribe(
      totalPrice=>this.totalPrice=totalPrice
    );
  }

   setupStripePaymentForm() {
    //handle stripe elem
    var elements=this.stripe.elements();

    //create a card elem and hide the zip code field
    this.cardElement=elements.create('card',{hidePostalCode:true});

    //add an instance of card UI comp into the card elem div
     this.cardElement.mount('#card-element');

     //add event binding for change event on the card element
     this.cardElement.on('change',(event:any)=>{
       //handle card-errors
       this.displayError=document.getElementById('card-errors');
       if(event.complete){
         this.displayError.textContent="";
       }else if(event.error){
         this.displayError.textContent=event.error.message;
       }
     });
  }
}
