import { useSignal } from "@preact/signals";

export const Login = () => {
  const isJoin = useSignal<boolean>(false);
  const action = `/api/${isJoin.value ? "join" : "login"}`;

  return (
    <div class="w-96 mx-auto">
      <form action={action} method="POST">
        <div>
          <label class="label">
            <span class="text-base label-text">Email</span>
          </label>
          <input
            name="email"
            type="text"
            placeholder="Email Address"
            class="w-full input input-bordered"
          />
        </div>
        <div>
          <label class="label">
            <span class="text-base label-text">Password</span>
          </label>
          <input
            name="password"
            type="password"
            placeholder="Enter Password"
            class="w-full input input-bordered"
          />
        </div>
        <div class="pt-4">
          <button
            onClick={() => {
              isJoin.value = !isJoin.value;
            }}
            type="button"
            class="btn btn-secondary float-left"
          >
            {isJoin.value ? "Login" : "Join"}
          </button>
          <button type="submit" class="btn btn-primary float-right">
            {isJoin.value ? "Join" : "Login"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;
