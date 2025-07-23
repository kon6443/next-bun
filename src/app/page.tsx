"use client";

export default function Home() {
  console.log("==========================================================");
  console.log("test:", process.env.TEST);
  console.log("test2:", process.env.TEST2);
  console.log("nxst_public_test:", process.env.NEXT_PUBLIC_TEST);
  console.log();
  return (
    <div>
      hello next world, node_env:::: {process.env.NODE_ENV}
      <div>test: {process.env.TEST}</div>
      <div>test2: {process.env.TEST2}</div>
      <div>next_public_test: {process.env.NEXT_PUBLIC_TEST}</div>
    </div>
  );
}
