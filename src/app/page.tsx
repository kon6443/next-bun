export default function Home() {
  return (
    <div>
      hello next world, TEST:::: {process.env.NODE_ENV},{" "}
      {process.env.NEXT_PUBLIC_TEST}
    </div>
  );
}
