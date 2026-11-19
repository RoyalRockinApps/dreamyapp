-- The app is for people affiliated with the Dream Theatre: owners and staff, cast and crew, and
-- anyone in a production's company. Everyone else (a renter with no company, such as an unknown
-- email that signed up) can still save a performer profile and apply for auditions, but rents the
-- theatre and buys tickets at thedreamtheatre.com. The app hides those screens from them; these
-- guards make the database refuse their rental requests, payments, seat holds and ticket orders too.
-- The owner still records bookings, payments and box-office sales for anyone.

create function private.is_affiliated() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people p
     where p.auth_user_id = auth.uid()
       and (p.role in ('owner', 'member') or exists (select 1 from public.memberships m where m.person_id = p.id))
  )
$$;

create function private.guard_outsider_sales() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- no signed-in person (migrations, the Supabase CLI): the theatre's own maintenance isn't limited
  if auth.uid() is not null and not private.is_affiliated() then
    raise exception 'Rent the theatre and buy tickets at thedreamtheatre.com.';
  end if;
  return new;
end $$;
revoke execute on function private.guard_outsider_sales() from public, anon, authenticated;

create trigger guard_outsider_sales before insert on public.bookings
  for each row execute function private.guard_outsider_sales();
create trigger guard_outsider_sales before insert on public.payments
  for each row execute function private.guard_outsider_sales();
create trigger guard_outsider_sales before insert on public.seat_claims
  for each row execute function private.guard_outsider_sales();
create trigger guard_outsider_sales before insert on public.orders
  for each row execute function private.guard_outsider_sales();
